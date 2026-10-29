// ── DPUse Framework
import { ConnectorError, ignoreErrors, parseDelimitedText, resolveDecoderId } from '@dpuse/dpuse-shared'; // TODO: This should be  Module or Tool error?
import type {
    ParserInterface,
    ParseStreamOptions,
    ParseTextOptions,
    ParseTextResult,
    ParsingRecord,
    PreviewIssue,
    RecordRetrievalTypeId,
    RetrieveRecordsSummary,
    ValueDelimiterId
} from '@dpuse/dpuse-shared';

// ── Local Framework
import type * as RustModule from '../rust/dpuse_tool_rust_csv_core_parser/pkg/dpuse_tool_rust_csv_core_parser.js';

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type RustBindings = typeof RustModule;

interface Utf8Transcoder {
    finish: () => Uint8Array;
    transcode: (bytes: Uint8Array) => Uint8Array;
}

export interface CsvProcessingOptions {
    delimiter?: string;
    hasHeaders?: boolean;
}

export interface CsvProcessingSummary {
    processedRowCount: number;
    failedRowCount: number;
    durationMs?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const config = {
    id: 'rust-csv-core',
    name: 'Rust CSV Core',
    version: '0.1.0'
} as const;

const DEFAULT_CHUNK_SIZE = 10_000;

// ── State ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const state: { rustBindingsPromise: Promise<RustBindings> | undefined } = {
    rustBindingsPromise: undefined
};

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Parses CSV with a Rust core compiled to WebAssembly, in one of two modes: a transferable ReadableStream where the
 * browser supports one (Chromium), or chunk by chunk where it does not (Safari).
 */
export class Tool implements ParserInterface {
    readonly config = config;

    /**
     * Parse stream. Reads delimited text from the stream. The caller owns the stream and its fetch, so a failed fetch is
     * the caller's to report. Aborting the signal stops the read and rejects with the signal's reason.
     */
    async parseStream(
        stream: ReadableStream<Uint8Array>,
        options: ParseStreamOptions,
        chunk: (typeId: RecordRetrievalTypeId, records: ParsingRecord[]) => void | Promise<void>
    ): Promise<RetrieveRecordsSummary> {
        const { RecordReader } = await loadRustBindings();
        options.abortSignal.throwIfAborted();
        const recordReader = new RecordReader(convertDelimiterToByte(options.valueDelimiterId));
        const transcoder = constructUtf8Transcoder(options.encodingId);
        const recordsPerChunk = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
        const reader = stream.getReader();
        // The stream may not be tied to the signal, so an abort cancels the read rather than waiting for the next chunk.
        const cancelRead = (): void => {
            ignoreErrors(() => void reader.cancel(options.abortSignal.reason));
        };
        options.abortSignal.addEventListener('abort', cancelRead, { once: true });

        let records: ParsingRecord[] = [];
        // A promise returned by 'chunk' is awaited before reading on, so a slow receiver holds the read back.
        const emitRecords = async (batch: RustModule.RecordBatch): Promise<void> => {
            for (const record of unpackRecordBatch(batch)) {
                records.push(record);
                if (records.length < recordsPerChunk) continue;
                const fullRecords = records;
                records = [];
                await chunk('parsingRecordArray', fullRecords);
            }
        };

        try {
            let result = await reader.read();
            while (!result.done) {
                options.abortSignal.throwIfAborted();
                await emitRecords(recordReader.pushChunk(transcoder == null ? result.value : transcoder.transcode(result.value)));
                result = await reader.read();
            }
            options.abortSignal.throwIfAborted();
            if (transcoder != null) await emitRecords(recordReader.pushChunk(transcoder.finish()));
            await emitRecords(recordReader.finish());
            if (records.length > 0) await chunk('parsingRecordArray', records);
            return {
                byteCount: recordReader.byteCount,
                commentLineCount: 0, // Comments are not read, as csv-parse is set up in 'dpuse-tool-adaltas-csv-parser'.
                emptyLineCount: recordReader.emptyLineCount,
                lineCount: recordReader.lineCount,
                nonUniformRecordCount: recordReader.nonUniformRecordCount,
                recordCount: recordReader.recordCount
            };
        } finally {
            options.abortSignal.removeEventListener('abort', cancelRead);
            recordReader.free();
            reader.releaseLock();
        }
    }

    /**
     * Parse text. 'csv-core' reads any text without error, so no issues are reported, and a quote left open simply
     * runs to the end of the text.
     */
    async parseText(text: string, options: ParseTextOptions): Promise<ParseTextResult> {
        const { RecordReader } = await loadRustBindings();
        return await parseDelimitedText(text, options, (delimitedText, delimiter): Promise<{ issues: PreviewIssue[]; records: ParsingRecord[] }> => {
            const recordReader = new RecordReader(convertDelimiterToByte(delimiter));
            try {
                const records = unpackRecordBatch(recordReader.pushChunk(new TextEncoder().encode(delimitedText)));
                records.push(...unpackRecordBatch(recordReader.finish()));
                return Promise.resolve({ issues: [], records });
            } finally {
                recordReader.free();
            }
        });
    }

    /**
     * Process CSV data using transferable ReadableStream (Chromium path).
     */
    async processWithTransferableStream(
        stream: ReadableStream<Uint8Array>,
        options: CsvProcessingOptions = {},
        onProgress?: (rowCount: number) => void
    ): Promise<CsvProcessingSummary> {
        const xxxx = await loadRustBindings();
        const delimiter = options.delimiter?.codePointAt(0) ?? 44; // Default comma
        const hasHeaders = options.hasHeaders ?? true;

        const startTime = performance.now();
        let processedRowCount = 0;

        const progressCallback = (count: number): void => {
            processedRowCount += count;
            if (onProgress) onProgress(count);
        };

        try {
            await xxxx.stream_csv(stream, progressCallback, delimiter, hasHeaders);
            return {
                processedRowCount,
                failedRowCount: 0,
                durationMs: performance.now() - startTime
            };
        } catch (error) {
            throw new ConnectorError('Failed to process CSV stream.', 'dpuse-tool-rust-csv-core-parser|Tool|processWithTransferableStream', { cause: error });
        }
    }

    /**
     * Process CSV data using chunk-by-chunk approach (Safari fallback).
     */
    async processWithChunks(stream: ReadableStream<Uint8Array>, options: CsvProcessingOptions = {}, onProgress?: (rowCount: number) => void): Promise<CsvProcessingSummary> {
        const { CsvSession } = await loadRustBindings();
        const delimiter = options.delimiter?.codePointAt(0) ?? 44;
        const hasHeaders = options.hasHeaders ?? true;

        const startTime = performance.now();
        let processedRowCount = 0;
        const session = new CsvSession(delimiter, hasHeaders);

        try {
            const reader = stream.getReader();

            try {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- The loop ends when the reader reports 'done'.
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    // if (value) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The WebAssembly bindings return untyped rows.
                    const rows = session.pushChunk(value);
                    const count = Array.isArray(rows) ? rows.length : 0;
                    processedRowCount += count;
                    if (onProgress && count > 0) onProgress(count);
                    // }
                }

                // Finish processing
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- The WebAssembly bindings return untyped rows.
                const remainingRows = session.finish();
                const remainingCount = Array.isArray(remainingRows) ? remainingRows.length : 0;
                processedRowCount += remainingCount;
                if (onProgress && remainingCount > 0) onProgress(remainingCount);

                return {
                    processedRowCount,
                    failedRowCount: 0,
                    durationMs: performance.now() - startTime
                };
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            throw new ConnectorError('Failed to process CSV chunks.', 'dpuse-tool-rust-csv-core-parser|Tool|processWithChunks', { cause: error });
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// The two least common delimiters are named by their character codes, because neither can be typed.
function convertDelimiterToByte(delimiter: ValueDelimiterId): number {
    if (delimiter === '0x1E') return 0x1e;
    if (delimiter === '0x1F') return 0x1f;
    const byte = delimiter.codePointAt(0);
    if (byte == null || byte > 0x7f) throw new Error(`Delimiter '${delimiter}' is not a single ASCII character.`);
    return byte;
}

// The Rust reader reads UTF-8. Text in any other encoding is decoded and encoded again as UTF-8 on the way in, so it is
// read as 'TextDecoder' reads it. UTF-8 is passed straight through, which saves a copy of every chunk.
function constructUtf8Transcoder(encodingId: string): Utf8Transcoder | undefined {
    const decoder = new TextDecoder(resolveDecoderId(encodingId));
    if (decoder.encoding === 'utf-8') return undefined;
    const encoder = new TextEncoder();
    return {
        finish: () => encoder.encode(decoder.decode()),
        transcode: (bytes) => encoder.encode(decoder.decode(bytes, { stream: true }))
    };
}

// Builds a record of '{ value, valueWasQuoted }' objects for each record in the batch, which is freed once read.
function unpackRecordBatch(batch: RustModule.RecordBatch): ParsingRecord[] {
    const { recordValueCounts, text, valueEnds, valueQuoted } = batch;
    batch.free();
    const records: ParsingRecord[] = [];
    let valueIndex = 0;
    let valueStart = 0;
    for (const valueCount of recordValueCounts) {
        const record: ParsingRecord = [];
        for (let index = 0; index < valueCount; index++) {
            const valueEnd = valueEnds[valueIndex] ?? valueStart;
            record.push({ value: text.slice(valueStart, valueEnd), valueWasQuoted: valueQuoted[valueIndex] === 1 });
            valueStart = valueEnd;
            valueIndex++;
        }
        records.push(record);
    }
    return records;
}

// The WebAssembly loads once, on first use; the promise is kept so callers that arrive together share one load.
async function loadRustBindings(): Promise<RustBindings> {
    state.rustBindingsPromise ??= (async () => {
        const module = await import('../rust/dpuse_tool_rust_csv_core_parser/pkg/dpuse_tool_rust_csv_core_parser.js');
        await module.default();
        return module;
    })();
    return state.rustBindingsPromise;
}
