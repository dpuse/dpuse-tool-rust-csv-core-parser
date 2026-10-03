// ── External Dependencies & Registrations
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// ── Local Framework
import { Tool } from '@/index';

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// The real Rust parser runs, built by 'npm run build' first. Its loader fetches the '.wasm' file beside it, which Node
// cannot do for a file URL, so fetch is stubbed to read it from disk.
const WASM_URL = new URL('../rust/dpuse_tool_rust_csv_core_parser/pkg/dpuse_tool_rust_csv_core_parser_bg.wasm', import.meta.url);

function createStream(...chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller): void {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        }
    });
}

describe('Tool', () => {
    beforeAll(async () => {
        const wasmBytes = await readFile(WASM_URL); // eslint-disable-line security/detect-non-literal-fs-filename -- A fixed path inside this repository.
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(new Response(wasmBytes, { headers: { 'Content-Type': 'application/wasm' } })))
        );
    });

    it('describes itself', () => {
        expect(new Tool().config).toEqual({ id: 'rust-csv-core', name: 'Rust CSV Core', version: '0.1.0' });
    });

    describe.each(['processWithChunks', 'processWithTransferableStream'] as const)('%s', (methodName) => {
        it('counts the data rows, leaving out the header row', async () => {
            const onProgress = vi.fn();

            const summary = await new Tool()[methodName](createStream('a,b\n1,2\n', '3,4\n5,6\n'), {}, onProgress);

            expect(summary.processedRowCount).toBe(3);
            expect(summary.failedRowCount).toBe(0);
            expect(summary.durationMs).toBeGreaterThanOrEqual(0);
            const reportedRowCount = onProgress.mock.calls.reduce((total, [count]) => total + (count as number), 0);
            expect(reportedRowCount).toBe(3);
        });

        it('counts every row when there is no header row, with another delimiter', async () => {
            const summary = await new Tool()[methodName](createStream('1;2\n3;4\n'), { delimiter: ';', hasHeaders: false });

            expect(summary.processedRowCount).toBe(2);
        });

        it('counts a final row with no line ending', async () => {
            const summary = await new Tool()[methodName](createStream('a,b\n1,2'));

            expect(summary.processedRowCount).toBe(1);
        });

        it('counts a final quoted row with no line ending', async () => {
            const summary = await new Tool()[methodName](createStream('a,b\n"1","x, y"'));

            expect(summary.processedRowCount).toBe(1);
        });
    });

    it('wraps a failure to read the stream in a connector error', async () => {
        const failingStream = new ReadableStream<Uint8Array>({
            pull(controller): void {
                controller.error(new Error('Network lost.'));
            }
        });

        await expect(new Tool().processWithChunks(failingStream)).rejects.toThrow('Failed to process CSV chunks.');
    });
});
