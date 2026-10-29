// ── External Dependencies & Registrations
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// ── DPUse Framework
import type { ParseStreamOptions, ParsingRecord, RetrieveRecordsSummary } from '@dpuse/dpuse-shared';

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

function listValues(chunks: ParsingRecord[][]): (string | null)[][] {
    return chunks.flat().map((record) => record.map((parsingValue) => parsingValue.value));
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

    describe('parseStream', () => {
        const parseStreamOptions = { abortSignal: new AbortController().signal, chunkSize: undefined, dataFormatId: 'dtv', encodingId: 'utf-8', valueDelimiterId: ',' } as const;

        async function parseStream(stream: ReadableStream<Uint8Array>, options: Partial<ParseStreamOptions> = {}): Promise<{ chunks: ParsingRecord[][]; summary: RetrieveRecordsSummary }> {
            const chunks: ParsingRecord[][] = [];
            const summary = await new Tool().parseStream(stream, { ...parseStreamOptions, ...options }, (_typeId, records) => {
                chunks.push(records);
            });
            return { chunks, summary };
        }

        it('returns every record, the header included, with whether each value was quoted', async () => {
            const { chunks, summary } = await parseStream(createStream('"a",b\n', ',""\n'));

            expect(chunks.flat()).toEqual([
                [
                    { value: 'a', valueWasQuoted: true },
                    { value: 'b', valueWasQuoted: false }
                ],
                [
                    { value: '', valueWasQuoted: false },
                    { value: '', valueWasQuoted: true }
                ]
            ]);
            expect(summary).toEqual({ byteCount: 10, commentLineCount: 0, emptyLineCount: 1, lineCount: 3, nonUniformRecordCount: 0, recordCount: 2 });
        });

        it('reads values split across chunks, with line endings and delimiters inside quotes', async () => {
            const { chunks, summary } = await parseStream(createStream('a,"x', '\ny, ', 'z"\r', '\n1,2'));

            expect(listValues(chunks)).toEqual([
                ['a', 'x\ny, z'],
                ['1', '2']
            ]);
            expect(summary.lineCount).toBe(3);
            expect(summary.emptyLineCount).toBe(0);
        });

        it('reads a blank line as a record of one empty value, and counts uneven records, as csv-parse does', async () => {
            const { chunks, summary } = await parseStream(createStream('a,b\n\n1\n1,2,3\n'));

            expect(listValues(chunks)).toEqual([['a', 'b'], [''], ['1'], ['1', '2', '3']]);
            expect(summary.nonUniformRecordCount).toBe(3);
            expect(summary.recordCount).toBe(4);
        });

        it('leaves out a byte order mark, even split across chunks', async () => {
            const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,b\n')]);
            const stream = new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(bytes.subarray(0, 2));
                    controller.enqueue(bytes.subarray(2));
                    controller.close();
                }
            });

            const { chunks } = await parseStream(stream);

            expect(listValues(chunks)).toEqual([['a', 'b']]);
        });

        it('reads text that is not UTF-8, and characters outside ASCII', async () => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x3b, 0x31, 0x0a])); // 'café;1' in Windows-1252.
                    controller.close();
                }
            });

            const { chunks: latinChunks } = await parseStream(stream, { encodingId: 'windows-1252', valueDelimiterId: ';' });
            const { chunks: utf8Chunks } = await parseStream(createStream('😀,é\n'));

            expect(listValues(latinChunks)).toEqual([['café', '1']]);
            expect(listValues(utf8Chunks)).toEqual([['😀', 'é']]);
        });

        it('reads a piece larger than a slice, with a character split between slices', async () => {
            const value = 'é'.repeat(300_000); // 600,000 bytes, so a slice of 1,048,576 bytes ends inside the second record's 'é'.

            const { chunks } = await parseStream(createStream(`${value}\n${value}\n${value}\n`));

            expect(listValues(chunks)).toEqual([[value], [value], [value]]);
        });

        it('hands records over in chunks of the size asked for, waiting for each to be received', async () => {
            const events: string[] = [];

            await new Tool().parseStream(createStream('1\n2\n3\n4\n5\n'), { ...parseStreamOptions, chunkSize: 2 }, async (_typeId, records) => {
                events.push(`start ${String(records.length)}`);
                await Promise.resolve();
                events.push('end');
            });

            expect(events).toEqual(['start 2', 'end', 'start 2', 'end', 'start 1', 'end']);
        });

        it('rejects with the reason when aborted', async () => {
            const abortController = new AbortController();
            const stream = new ReadableStream<Uint8Array>({
                start(controller): void {
                    controller.enqueue(new TextEncoder().encode('a\n'));
                }
            });
            setTimeout(() => {
                abortController.abort(new Error('Stopped.'));
            }, 0);

            await expect(parseStream(stream, { abortSignal: abortController.signal })).rejects.toThrow('Stopped.');
        });
    });

    describe('parseText', () => {
        it('finds the delimiter and reads every record, with no issues', async () => {
            const result = await new Tool().parseText('a;b\n1;"2"\n', { dataFormatId: 'dtv', isComplete: true, valueDelimiterIds: [',', ';'] });

            expect(result.valueDelimiterId).toBe(';');
            expect(result.recordDelimiterId).toBe('\n');
            expect(result.issues).toEqual([]);
            expect(result.parsedRecords[1]).toEqual([
                { value: '1', valueWasQuoted: false },
                { value: '2', valueWasQuoted: true }
            ]);
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
