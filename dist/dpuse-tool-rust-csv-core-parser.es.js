//#region node_modules/@dpuse/dpuse-shared/dist/dpuse-shared-errors.es.js
var e = class extends Error {
	data;
	locator;
	constructor(e, t, n, r) {
		super(e, r), this.name = "DPUseError", this.data = n, this.locator = t;
	}
}, t = class extends e {
	constructor(e, t, n, r) {
		super(e, t, n, r), this.name = "ConnectorError";
	}
}, n = {
	id: "rust-csv-core",
	name: "Rust CSV Core",
	version: "0.1.0"
}, r = { rustBindingsPromise: void 0 }, i = class {
	config = n;
	async processWithTransferableStream(e, n = {}, r) {
		let i = await a(), o = n.delimiter?.codePointAt(0) ?? 44, s = n.hasHeaders ?? !0, c = performance.now(), l = 0, u = (e) => {
			l += e, r && r(e);
		};
		try {
			return await i.stream_csv(e, u, o, s), {
				processedRowCount: l,
				failedRowCount: 0,
				durationMs: performance.now() - c
			};
		} catch (e) {
			throw new t("Failed to process CSV stream.", "dpuse-tool-rust-csv-core-parser|Tool|processWithTransferableStream", { cause: e });
		}
	}
	async processWithChunks(e, n = {}, r) {
		let { CsvSession: i } = await a(), o = n.delimiter?.codePointAt(0) ?? 44, s = n.hasHeaders ?? !0, c = performance.now(), l = 0, u = new i(o, s);
		try {
			let t = e.getReader();
			try {
				for (;;) {
					let { value: e, done: n } = await t.read();
					if (n) break;
					let i = u.pushChunk(e), a = Array.isArray(i) ? i.length : 0;
					l += a, r && a > 0 && r(a);
				}
				let e = u.finish(), n = Array.isArray(e) ? e.length : 0;
				return l += n, r && n > 0 && r(n), {
					processedRowCount: l,
					failedRowCount: 0,
					durationMs: performance.now() - c
				};
			} finally {
				t.releaseLock();
			}
		} catch (e) {
			throw new t("Failed to process CSV chunks.", "dpuse-tool-rust-csv-core-parser|Tool|processWithChunks", { cause: e });
		}
	}
};
async function a() {
	return r.rustBindingsPromise ??= (async () => {
		let e = await import("./dpuse_tool_rust_csv_core_parser-BwgIkyVB.js");
		return await e.default(), e;
	})(), r.rustBindingsPromise;
}
//#endregion
export { i as Tool, n as config };

//# sourceMappingURL=dpuse-tool-rust-csv-core-parser.es.js.map