//! CSV streaming core for Data Positioning tool.
//!
//! This module wraps the `csv-core` parser so the browser can feed raw
//! bytes from a `ReadableStream` into WebAssembly and receive parsed rows.

use csv_core::{ReadFieldResult, ReadRecordResult, Reader, ReaderBuilder};
use futures::StreamExt;
use js_sys::{Function, Uint8Array};
use serde_wasm_bindgen::to_value;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;
use wasm_streams::ReadableStream as WasmReadableStream;

#[wasm_bindgen]
pub fn init() {
    // Install better panic messages so JavaScript receives meaningful errors.
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct CsvSession {
    /// Incremental CSV reader from the `csv-core` crate.
    reader: Reader,
    /// Byte staging area that accumulates incoming data across pushes.
    buffer: Vec<u8>,
    /// Working storage for the current record produced by the parser.
    record_buffer: Vec<u8>,
    /// Offsets that mark the end of each field within `record_buffer`.
    field_ends: Vec<usize>,
    /// Bytes we have decoded for a record that is not yet complete.
    pending_record: Vec<u8>,
    /// Field boundaries that belong to the pending partial record.
    pending_field_ends: Vec<usize>,
    /// Whether the first row should be treated as headers.
    has_headers: bool,
    /// Flag that indicates we already skipped the header row.
    headers_skipped: bool,
    /// Cached normalized header names.
    normalized_headers: Option<Vec<String>>,
}

#[wasm_bindgen]
impl CsvSession {
    #[wasm_bindgen(constructor)]
    pub fn new(delimiter: u8, has_headers: bool) -> CsvSession {
        // Configure the CSV reader with the delimiter chosen by the caller.
        let reader = ReaderBuilder::new().delimiter(delimiter).build();

        CsvSession {
            reader,
            buffer: Vec::new(),
            record_buffer: vec![0; 1024],
            field_ends: vec![0; 32],
            pending_record: Vec::new(),
            pending_field_ends: Vec::new(),
            has_headers,
            headers_skipped: false,
            normalized_headers: None,
        }
    }

    #[wasm_bindgen(js_name = pushChunk)]
    pub fn push_chunk(&mut self, chunk: Uint8Array) -> Result<JsValue, JsValue> {
        // Copy the JavaScript `Uint8Array` into Rust-owned memory so the parser
        // can work with it after the JS engine moves on to the next chunk.
        let mut data = vec![0u8; chunk.length() as usize];
        chunk.copy_to(&mut data[..]);
        let records = self.push_bytes(&data)?;
        rows_to_js_value(records)
    }

    #[wasm_bindgen]
    pub fn finish(&mut self) -> Result<JsValue, JsValue> {
        // Flush all pending bytes and return any remaining rows.
        let records = self.finish_rows()?;
        rows_to_js_value(records)
    }

    fn push_bytes(&mut self, data: &[u8]) -> Result<Vec<Vec<String>>, JsValue> {
        // Append the new bytes and attempt to extract complete records.
        self.buffer.extend_from_slice(data);
        self.drain_records(false)
    }

    fn finish_rows(&mut self) -> Result<Vec<Vec<String>>, JsValue> {
        // Parse what is left, then tell the reader the input has ended so it returns a last row with no line ending.
        self.drain_records(true)
    }

    fn drain_records(&mut self, final_flush: bool) -> Result<Vec<Vec<String>>, JsValue> {
        // `output` collects the fully parsed rows for this call. We re-use the
        // `pending_*` vectors so partially read records survive across pushes.
        let mut output: Vec<Vec<String>> = Vec::new();
        let mut offset: usize = 0;
        let mut current_record = core::mem::take(&mut self.pending_record);
        let mut current_field_ends = core::mem::take(&mut self.pending_field_ends);

        loop {
            // An empty input tells `csv-core` the data has ended, so it is only passed on the final flush.
            let input = &self.buffer[offset..];
            if input.is_empty() && !final_flush {
                break;
            }
            let (result, in_read, out_written, ends_written) =
                self.reader
                    .read_record(input, &mut self.record_buffer, &mut self.field_ends);

            offset = offset.saturating_add(in_read);

            // Accumulate record bytes and field markers until we have a full row.
            if out_written > 0 {
                current_record.extend_from_slice(&self.record_buffer[..out_written]);
            }
            if ends_written > 0 {
                current_field_ends.extend_from_slice(&self.field_ends[..ends_written]);
            }

            match result {
                ReadRecordResult::Record => {
                    // We reached the end of a row. Materialise it as UTF-8 strings.
                    let row = build_row(&current_record, &current_field_ends)?;
                    if self.has_headers && !self.headers_skipped {
                        let normalized = row
                            .iter()
                            .map(|field| normalize_field_name(field))
                            .collect();
                        self.normalized_headers = Some(normalized);
                        // Discard the first row when headers are enabled.
                        self.headers_skipped = true;
                    } else {
                        let summary = summarize_row(&row);
                        if !summary.is_empty() {
                            output.push(row);
                        }
                    }
                    // Reset our scratch buffers for the next record.
                    current_record.clear();
                    current_field_ends.clear();
                }
                ReadRecordResult::InputEmpty => {
                    // On the final flush, go round again with empty input to complete any part-read last row.
                    if !final_flush {
                        break;
                    }
                }
                ReadRecordResult::OutputFull => {
                    // `csv-core` needs larger buffers; grow them exponentially
                    // to reduce reallocations on wide rows.
                    self.record_buffer
                        .resize(self.record_buffer.len().max(out_written + 1024) * 2, 0);
                }
                ReadRecordResult::OutputEndsFull => {
                    self.field_ends
                        .resize(self.field_ends.len().max(ends_written + 16) * 2, 0);
                }
                ReadRecordResult::End => break,
            }
        }

        if offset > 0 {
            // Discard consumed bytes so the buffer only holds unfinished data.
            self.buffer.drain(..offset);
        }

        if final_flush {
            // We are finishing the stream, so the buffer can be cleared.
            self.buffer.clear();
        }

        self.pending_record = current_record;
        self.pending_field_ends = current_field_ends;

        Ok(output)
    }
}

/// The records completed by one call of `RecordReader`, packed so that crossing into JavaScript costs a few copies
/// rather than one per value. The values are joined into `text`, and each ends at its entry in `value_ends`, counted
/// in UTF-16 code units so JavaScript can slice them out directly.
#[wasm_bindgen(getter_with_clone)]
pub struct RecordBatch {
    pub text: String,
    #[wasm_bindgen(js_name = valueEnds)]
    pub value_ends: Vec<u32>,
    #[wasm_bindgen(js_name = valueQuoted)]
    pub value_quoted: Vec<u8>, // 1 where the value was quoted in the text.
    #[wasm_bindgen(js_name = recordValueCounts)]
    pub record_value_counts: Vec<u32>,
}

/// Reads delimited text a chunk at a time and returns every record, the header included, as csv-parse does with the
/// options `dpuse-tool-adaltas-csv-parser` pins. `csv-core` skips blank lines and does not say whether a value was
/// quoted, so fields are read one at a time: a blank line becomes a record of one empty value, and a value is quoted
/// when its first character is the quote.
#[wasm_bindgen]
pub struct RecordReader {
    reader: Reader,
    field_output: Vec<u8>, // Working storage `csv-core` writes each part of a field into.
    field_bytes: Vec<u8>, // The field being read, which can span chunks.
    is_bom_checked: bool,
    leading_bytes: Vec<u8>, // The first bytes, held until there are enough to tell if they start with a byte order mark.
    is_at_record_start: bool,
    is_at_field_start: bool,
    is_field_quoted: bool,
    previous_byte: u8, // The last byte the fields were read from, so a '\n' straight after a '\r' ends the same line.
    previous_line_byte: u8, // The last byte lines were counted in.
    record_value_count: u32,
    first_record_value_count: Option<u32>,
    byte_count: f64,
    line_count: u32,
    non_uniform_record_count: u32,
    record_count: u32,
    batch_text_length: u32, // The batch's text length in UTF-16 code units.
    batch: RecordBatch,
    complete_batch_text_byte_length: usize, // Where the last complete record ends in the batch. A batch holds only
    complete_batch_text_length: u32, // complete records, so the values of one still being read wait for the next.
    complete_batch_value_count: usize,
}

const BYTE_ORDER_MARK: [u8; 3] = [0xEF, 0xBB, 0xBF];
const QUOTE: u8 = b'"';

#[wasm_bindgen]
impl RecordReader {
    #[wasm_bindgen(constructor)]
    pub fn new(delimiter: u8) -> RecordReader {
        RecordReader {
            reader: ReaderBuilder::new().delimiter(delimiter).quote(QUOTE).build(),
            field_output: vec![0; 1024],
            field_bytes: Vec::new(),
            is_bom_checked: false,
            leading_bytes: Vec::new(),
            is_at_record_start: true,
            is_at_field_start: true,
            is_field_quoted: false,
            previous_byte: 0,
            previous_line_byte: 0,
            record_value_count: 0,
            first_record_value_count: None,
            byte_count: 0.0,
            line_count: 0,
            non_uniform_record_count: 0,
            record_count: 0,
            batch_text_length: 0,
            batch: RecordBatch { text: String::new(), value_ends: Vec::new(), value_quoted: Vec::new(), record_value_counts: Vec::new() },
            complete_batch_text_byte_length: 0,
            complete_batch_text_length: 0,
            complete_batch_value_count: 0,
        }
    }

    #[wasm_bindgen(js_name = pushChunk)]
    pub fn push_chunk(&mut self, chunk: &[u8]) -> RecordBatch {
        self.byte_count += chunk.len() as f64;
        if self.is_bom_checked {
            self.read(chunk, false);
        } else {
            self.leading_bytes.extend_from_slice(chunk);
            if self.leading_bytes.len() >= BYTE_ORDER_MARK.len() {
                self.read_leading_bytes();
            }
        }
        self.take_batch()
    }

    pub fn finish(&mut self) -> RecordBatch {
        if !self.is_bom_checked {
            self.read_leading_bytes();
        }
        self.read(&[], true);
        if self.previous_line_byte != 0 {
            self.line_count += 1; // The last line, even an empty one after a final line ending, as csv-parse counts it.
        }
        self.take_batch()
    }

    // csv-parse counts the empty line after a final line ending, and reads any other blank line as a record.
    #[wasm_bindgen(getter, js_name = emptyLineCount)]
    pub fn empty_line_count(&self) -> u32 {
        u32::from(self.previous_line_byte == b'\n' || self.previous_line_byte == b'\r')
    }

    #[wasm_bindgen(getter, js_name = byteCount)]
    pub fn byte_count(&self) -> f64 {
        self.byte_count
    }

    #[wasm_bindgen(getter, js_name = lineCount)]
    pub fn line_count(&self) -> u32 {
        self.line_count
    }

    #[wasm_bindgen(getter, js_name = nonUniformRecordCount)]
    pub fn non_uniform_record_count(&self) -> u32 {
        self.non_uniform_record_count
    }

    #[wasm_bindgen(getter, js_name = recordCount)]
    pub fn record_count(&self) -> u32 {
        self.record_count
    }
}

impl RecordReader {
    // A byte order mark is left out, as 'TextDecoder' leaves it out of the text csv-parse reads.
    fn read_leading_bytes(&mut self) {
        self.is_bom_checked = true;
        let leading_bytes = core::mem::take(&mut self.leading_bytes);
        let start = if leading_bytes.starts_with(&BYTE_ORDER_MARK) { BYTE_ORDER_MARK.len() } else { 0 };
        self.read(&leading_bytes[start..], false);
    }

    fn read(&mut self, input: &[u8], is_final: bool) {
        self.count_lines(input);
        let mut offset = 0;
        loop {
            if self.is_at_record_start {
                offset += self.skip_blank_lines(&input[offset..]);
            }
            if self.is_at_field_start && offset < input.len() {
                self.is_field_quoted = input[offset] == QUOTE;
                self.is_at_field_start = false;
                self.is_at_record_start = false;
            }
            // An empty input tells `csv-core` the text has ended, so it is only passed at the end.
            let rest = &input[offset..];
            if rest.is_empty() && !is_final {
                break;
            }
            let (result, read_count, written_count) = self.reader.read_field(rest, &mut self.field_output);
            if read_count > 0 {
                self.previous_byte = rest[read_count - 1];
            }
            offset += read_count;
            self.field_bytes.extend_from_slice(&self.field_output[..written_count]);
            match result {
                ReadFieldResult::InputEmpty => break,
                ReadFieldResult::OutputFull => {
                    let length = self.field_output.len();
                    self.field_output.resize(length * 2, 0);
                }
                ReadFieldResult::Field { record_end } => {
                    self.complete_value();
                    if record_end {
                        self.complete_record();
                    } else {
                        self.is_at_field_start = true;
                    }
                }
                ReadFieldResult::End => break,
            }
        }
    }

    // Lines are counted as csv-parse counts them: a '\r\n' is one line ending, and a line ending inside a quoted value
    // still counts.
    fn count_lines(&mut self, input: &[u8]) {
        for &byte in input {
            if byte == b'\r' || (byte == b'\n' && self.previous_line_byte != b'\r') {
                self.line_count += 1;
            }
            self.previous_line_byte = byte;
        }
    }

    // `csv-core` would skip a blank line, so they are taken before it sees them. A '\n' straight after a '\r' is the end
    // of the record just read, not a blank line.
    fn skip_blank_lines(&mut self, input: &[u8]) -> usize {
        let mut skipped_count = 0;
        for &byte in input {
            if byte != b'\n' && byte != b'\r' {
                break;
            }
            if !(byte == b'\n' && self.previous_byte == b'\r') {
                self.complete_value();
                self.complete_record();
            }
            self.previous_byte = byte;
            skipped_count += 1;
        }
        skipped_count
    }

    fn complete_value(&mut self) {
        let value = String::from_utf8_lossy(&self.field_bytes);
        self.batch_text_length += if value.is_ascii() { value.len() as u32 } else { value.encode_utf16().count() as u32 };
        self.batch.text.push_str(&value);
        self.batch.value_ends.push(self.batch_text_length);
        self.batch.value_quoted.push(u8::from(self.is_field_quoted));
        self.field_bytes.clear();
        self.is_field_quoted = false;
        self.record_value_count += 1;
    }

    // Records are uneven when their number of values differs from the first record's, as csv-parse counts them.
    fn complete_record(&mut self) {
        match self.first_record_value_count {
            None => self.first_record_value_count = Some(self.record_value_count),
            Some(count) if count != self.record_value_count => self.non_uniform_record_count += 1,
            Some(_) => {}
        }
        self.batch.record_value_counts.push(self.record_value_count);
        self.record_count += 1;
        self.record_value_count = 0;
        self.is_at_record_start = true;
        self.is_at_field_start = true;
        self.complete_batch_text_byte_length = self.batch.text.len();
        self.complete_batch_text_length = self.batch_text_length;
        self.complete_batch_value_count = self.batch.value_ends.len();
    }

    fn take_batch(&mut self) -> RecordBatch {
        let pending_text = self.batch.text.split_off(self.complete_batch_text_byte_length);
        let pending_value_ends = self.batch.value_ends.split_off(self.complete_batch_value_count);
        let pending_value_quoted = self.batch.value_quoted.split_off(self.complete_batch_value_count);
        let complete_text_length = self.complete_batch_text_length;
        self.batch_text_length -= complete_text_length;
        self.complete_batch_text_byte_length = 0;
        self.complete_batch_text_length = 0;
        self.complete_batch_value_count = 0;
        core::mem::replace(
            &mut self.batch,
            RecordBatch {
                text: pending_text,
                value_ends: pending_value_ends.into_iter().map(|value_end| value_end - complete_text_length).collect(),
                value_quoted: pending_value_quoted,
                record_value_counts: Vec::new(),
            },
        )
    }
}

/// Process a ReadableStream of CSV data with streaming support.
#[wasm_bindgen]
pub fn stream_csv(
    input: JsValue,
    progress_callback: Function,
    delimiter: u8,
    has_headers: bool,
) -> Result<js_sys::Promise, JsValue> {
    // `future_to_promise` bridges the async Rust future into a JS `Promise`
    // so callers in TypeScript can `await` the stream piping operation just
    // like any other asynchronous browser API.
    Ok(future_to_promise(async move {
        let mut session = CsvSession::new(delimiter, has_headers);
        let mut input_stream = WasmReadableStream::from_raw(input.into()).into_stream();
        let callback = progress_callback;

        while let Some(chunk) = input_stream.next().await {
            let chunk = chunk?;
            let view = Uint8Array::new(&chunk);
            let mut data = vec![0u8; view.length() as usize];
            view.copy_to(&mut data[..]);

            // Feed bytes into the session and report the processed row count.
            let rows = session.push_bytes(&data)?;
            if !rows.is_empty() {
                let count = JsValue::from_f64(rows.len() as f64);
                callback.call1(&JsValue::NULL, &count)?;
            }
        }

        // Flush tail bytes after the stream ends.
        let remaining = session.finish_rows()?;
        if !remaining.is_empty() {
            let count = JsValue::from_f64(remaining.len() as f64);
            callback.call1(&JsValue::NULL, &count)?;
        }

        Ok(JsValue::undefined())
    }))
}

/// Process chunks of CSV data iteratively (Safari fallback).
#[wasm_bindgen]
pub fn process_csv_chunks(
    delimiter: u8,
    has_headers: bool,
) -> CsvSession {
    CsvSession::new(delimiter, has_headers)
}

// Helper functions

fn build_row(record: &[u8], field_ends: &[usize]) -> Result<Vec<String>, JsValue> {
    let mut row = Vec::new();
    let mut start = 0;

    for &end in field_ends {
        let field_bytes = &record[start..end];
        let field_str = std::str::from_utf8(field_bytes)
            .map_err(|e| JsValue::from_str(&format!("UTF-8 error: {}", e)))?;
        row.push(field_str.to_string());
        start = end;
    }

    Ok(row)
}

fn normalize_field_name(field: &str) -> String {
    field
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
        .collect()
}

fn summarize_row(row: &[String]) -> String {
    // Check if row has any non-empty content
    row.iter().find(|s| !s.trim().is_empty()).map_or(String::new(), |_| "non-empty".to_string())
}

fn rows_to_js_value(rows: Vec<Vec<String>>) -> Result<JsValue, JsValue> {
    // Convert the Rust vectors into a JS array-of-arrays.
    to_value(&rows).map_err(|error| JsValue::from_str(&format!("Serialisation error: {error}")))
}
