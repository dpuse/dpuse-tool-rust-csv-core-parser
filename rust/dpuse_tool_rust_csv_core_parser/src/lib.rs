//! CSV streaming core for Data Positioning tool.
//!
//! This module wraps the `csv-core` parser so the browser can feed raw
//! bytes from a `ReadableStream` into WebAssembly and receive parsed rows.

use csv_core::{ReadRecordResult, Reader, ReaderBuilder};
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
        // The `csv-core` reader expects newline-terminated input. Append a
        // newline when the data source does not end with one.
        if !self.buffer.is_empty() && !self.buffer.ends_with(b"\n") {
            self.buffer.push(b'\n');
        }

        self.drain_records(true)
    }

    fn drain_records(&mut self, final_flush: bool) -> Result<Vec<Vec<String>>, JsValue> {
        // `output` collects the fully parsed rows for this call. We re-use the
        // `pending_*` vectors so partially read records survive across pushes.
        let mut output: Vec<Vec<String>> = Vec::new();
        let mut offset: usize = 0;
        let mut current_record = core::mem::take(&mut self.pending_record);
        let mut current_field_ends = core::mem::take(&mut self.pending_field_ends);

        while offset < self.buffer.len() {
            let input = &self.buffer[offset..];
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
                ReadRecordResult::InputEmpty => break,
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
