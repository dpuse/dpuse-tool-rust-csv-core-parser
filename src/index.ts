// ── DPUse Framework
import { ConnectorError, getValueDelimiterCharacter, ignoreErrors, parseDelimitedPreview, resolveDecoderId } from '@dpuse/dpuse-shared'; // TODO: This should be  Module or Tool error?
import type {
    ParsedRecord,
    ParsedRecordsChunk,
    ParsePreviewOptions,
    ParsePreviewResult,
    ParserInterface,
    ParseStreamOptions,
    ParseStreamSummary,
    SampleIssue,
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

// WebKit hands over a file stream in pieces of about 18 MB, against about 2 MB in Chromium. Each piece is copied into
// WebAssembly memory, which never shrinks, so pieces that large grew it to 567 MB. Each piece is read in slices of this
// size instead. A slice is a view, not a copy.
const MAX_SLICE_BYTE_COUNT = 1_048_576;

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
    async *parseStream(stream: ReadableStream<Uint8Array>, options: ParseStreamOptions): AsyncGenerator<ParsedRecordsChunk, ParseStreamSummary, undefined> {
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

        let records: ParsedRecord[] = [];
        // Hands over each chunk as it fills. Nothing more is read until the receiver asks for the next one, so a slow
        // receiver holds the read back.
        function* takeFullChunks(batch: RustModule.RecordBatch): Generator<ParsedRecordsChunk> {
            for (const record of unpackRecordBatch(batch)) {
                records.push(record);
                if (records.length < recordsPerChunk) continue;
                const fullRecords = records;
                records = [];
                yield { records: fullRecords, typeId: 'parsingRecordArray' };
            }
        }

        try {
            let result = await reader.read();
            while (!result.done) {
                options.abortSignal.throwIfAborted();
                const bytes = transcoder == null ? result.value : transcoder.transcode(result.value);
                for (let sliceStart = 0; sliceStart < bytes.length; sliceStart += MAX_SLICE_BYTE_COUNT) {
                    yield* takeFullChunks(recordReader.pushChunk(bytes.subarray(sliceStart, sliceStart + MAX_SLICE_BYTE_COUNT)));
                }
                result = await reader.read();
            }
            options.abortSignal.throwIfAborted();
            if (transcoder != null) yield* takeFullChunks(recordReader.pushChunk(transcoder.finish()));
            yield* takeFullChunks(recordReader.finish());
            if (records.length > 0) yield { records, typeId: 'parsingRecordArray' };
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
     * Parse preview. Reads the preview's bytes the same way as 'parseStream': UTF-8 goes straight to the reader, and any
     * other encoding is first read as UTF-8. 'csv-core' reads any text without error, so no issues are reported, and a
     * quote left open simply runs to the end of the preview.
     */
    async parsePreview(bytes: Uint8Array, options: ParsePreviewOptions): Promise<ParsePreviewResult> {
        const { RecordReader } = await loadRustBindings();
        return await parseDelimitedPreview(bytes, options, (preview, delimiter): Promise<{ issues: SampleIssue[]; records: ParsedRecord[] }> => {
            const recordReader = new RecordReader(convertDelimiterToByte(delimiter));
            const transcoder = constructUtf8Transcoder(preview.encodingId);
            try {
                const records = unpackRecordBatch(recordReader.pushChunk(transcoder == null ? preview.bytes : transcoder.transcode(preview.bytes)));
                if (transcoder != null) {
                    const finalBatch = recordReader.pushChunk(transcoder.finish());
                    records.push(...unpackRecordBatch(finalBatch));
                }
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

function convertDelimiterToByte(delimiter: ValueDelimiterId): number {
    const byte = getValueDelimiterCharacter(delimiter).codePointAt(0);
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

// Builds each record in the batch, which is freed once read. A value with nothing written, such as ',,', is null, and
// an empty quoted value, '""', stays an empty string, so the two can still be told apart.
function unpackRecordBatch(batch: RustModule.RecordBatch): ParsedRecord[] {
    const recordValueCounts = batch.takeRecordValueCounts();
    const text = batch.takeText();
    const valueEnds = batch.takeValueEnds();
    const valueQuoted = batch.takeValueQuoted();
    batch.free();
    const records: ParsedRecord[] = [];
    let valueIndex = 0;
    let valueStart = 0;
    for (const valueCount of recordValueCounts) {
        const record: ParsedRecord = [];
        for (let index = 0; index < valueCount; index++) {
            const valueEnd = valueEnds[valueIndex] ?? valueStart;
            record.push(valueEnd === valueStart && valueQuoted[valueIndex] !== 1 ? null : text.slice(valueStart, valueEnd));
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
