// ── DPUse Framework
import { ConnectorError } from '@dpuse/dpuse-shared'; // TODO: This should be  Module or Tool error?

// ── Local Framework
import type * as RustModule from '../rust/dpuse_tool_rust_csv_core_parser/pkg/dpuse_tool_rust_csv_core_parser.js';

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type RustBindings = typeof RustModule;

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

// ── State ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const state: { rustBindingsPromise: Promise<RustBindings> | undefined } = {
    rustBindingsPromise: undefined
};

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Parses CSV with a Rust core compiled to WebAssembly, in one of two modes: a transferable ReadableStream where the
 * browser supports one (Chromium), or chunk by chunk where it does not (Safari).
 */
export class Tool {
    readonly config = config;

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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    // if (value) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const rows = session.pushChunk(value);
                    const count = Array.isArray(rows) ? rows.length : 0;
                    processedRowCount += count;
                    if (onProgress && count > 0) onProgress(count);
                    // }
                }

                // Finish processing
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

// The WebAssembly loads once, on first use; the promise is kept so callers that arrive together share one load.
async function loadRustBindings(): Promise<RustBindings> {
    state.rustBindingsPromise ??= (async () => {
        const module = await import('../rust/dpuse_tool_rust_csv_core_parser/pkg/dpuse_tool_rust_csv_core_parser.js');
        await module.default();
        return module;
    })();
    return state.rustBindingsPromise;
}
