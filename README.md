# DPUse Rust CSV Core Parser Tool

<!-- OPENING_START -->

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DPUse version](https://img.shields.io/github/v/release/dpuse/dpuse-tool-rust-csv-core-parser?color=f6821f&label=DPUse)](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/releases/latest)
[![npm version](https://img.shields.io/npm/v/@dpuse/dpuse-tool-rust-csv-core-parser?color=cb3837&label=npm)](https://www.npmjs.com/package/@dpuse/dpuse-tool-rust-csv-core-parser)
[![CI](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/ci.yml)

CSV parser tool with Rust/WASM core for high-performance streaming

[Report a Vulnerability](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/security/advisories/new) · [Open an Issue](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/issues)

## About DPUse

[DPUse](https://www.dpuse.app) (Data Positioning & Use) is an in-browser application that positions your data for use through three core activities: sourcing, contextualising, and publishing.

**Sourcing** uses a library of [Connectors](https://www.dpuse.app/connectors) to establish [Connections](https://www.dpuse.app) to applications, databases, file stores, and curated datasets; these connections are subsequently used to configure structured [Data Views](https://www.dpuse.app) from the underlying sources.

**Contextualising** extracts chronological events from those [Data Views](https://www.dpuse.app) and maps them into comprehensive [Context Models](https://www.dpuse.app). This gives the DPUse Engine the structural framework needed to generate deterministic transactions, facts, or observations.

**Publishing** uses a library of [Presenters](https://www.dpuse.app) to render standard [Presentations](https://www.dpuse.app) immediately using the contextualised data; additionally, [Cookbooks](https://www.dpuse.app) of [Recipes](https://www.dpuse.app) let you build Data Apps using your preferred tools.

In addition, DPUse provides [Tools](https://www.dpuse.app) used by the application, and you can use them to construct connectors and presenters.

## Introduction

...

<!-- OPENING_END -->

A high-performance CSV parsing tool with Rust/WebAssembly core for the Data Positioning platform. Provides streaming CSV processing with automatic fallback for browsers without transferable ReadableStream support.

## Features

- **High Performance**: Rust/WASM core using `csv-core` for efficient parsing
- **Dual Mode Processing**:
    - **Stream Mode**: For Chromium-based browsers with transferable ReadableStream support
    - **Chunk Mode**: Fallback for Safari (iOS & macOS) without transferable stream support
- **Progressive Callbacks**: Real-time progress updates during processing
- **Single Load**: Dynamically loaded once and shared across all connectors
- **Memory Efficient**: Streaming architecture processes large files without loading entire content into memory

<!-- USAGE_START -->

## Usage

This [package](https://www.npmjs.com/package/@dpuse/dpuse-tool-rust-csv-core-parser) is available on [npm](https://www.npmjs.com/). Install it with:

```bash
npm install @dpuse/dpuse-tool-rust-csv-core-parser
```

To work on the source instead, clone this repository.

```bash
git clone https://github.com/dpuse/dpuse-tool-rust-csv-core-parser.git
cd dpuse-tool-rust-csv-core-parser
npm install
```

_Requires [Node.js](https://nodejs.org/) 24 or later, [npm](https://www.npmjs.com/) 12 or later, and [TypeScript](https://www.typescriptlang.org/) 6.0.3 or later._

This repository is managed using the common set of actions provided by [@dpuse/dpuse-development](https://github.com/dpuse/dpuse-development). See the `scripts` block in [package.json](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/blob/main/package.json) for details.

<!-- USAGE_END -->

```bash
# Install dependencies
npm install

# Build Rust WASM module
npm run build:wasm

# Build TypeScript + bundle WASM
npm run build
```

Prerequisites:

- Node.js 24+
- Rust toolchain
- `wasm-pack` CLI: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`

The tool encapsulates:

- **Rust Core** (`rust/dpuse_tool_rust_csv_core_parser`): Low-level CSV parsing with `csv-core`
- **TypeScript Wrapper** (`src/index.ts`): Browser-friendly API with automatic mode selection
- **WASM Binary**: Compiled once, bundled with the tool

### Example

The tool is designed to be loaded dynamically by connectors:

```typescript
import { loadTool } from '@dpuse/dpuse-shared/component/tool';
import type { Tool as RustCsvCoreTool } from '@dpuse/dpuse-tool-rust-csv-core-parser';

// Load the tool (loaded once, shared across all uses)
const csvTool = await loadTool<RustCsvCoreTool>(toolConfigs, 'rust-csv-core');

// Process with transferable streams (Chromium)
const result = await csvTool.processWithTransferableStream(readableStream, { delimiter: ',', hasHeaders: true }, (rowCount) => console.log(`Processed ${rowCount} rows`));

// Process with chunks (Safari fallback)
const result = await csvTool.processWithChunks(readableStream, { delimiter: ',', hasHeaders: true }, (rowCount) => console.log(`Processed ${rowCount} rows`));
```

Structure:

```bash
dpuse-tool-rust-csv-core-parser/
├── src/
│   └── index.ts              # TypeScript API wrapper
├── rust/
│   └── dpuse_tool_rust_csv_core_parser/
│       ├── src/
│       │   └── lib.rs         # Rust CSV core
│       ├── pkg/               # Generated WASM (gitignored)
│       └── Cargo.toml
├── dist/                      # Built package (gitignored)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

<!-- DEPENDENCY_LICENSES_START -->

## Dependency Licenses

License data is updated each time `npm run document` is run, using [license-checker](https://github.com/RSeidelsohn/license-checker-rseidelsohn) and [cargo tree](https://doc.rust-lang.org/cargo/commands/cargo-tree.html). The following table lists every package whose code, styles or assets are included in this project's build, as recorded by the build itself. Modules loaded at run time are not included; each documents its own. It also lists every Rust crate compiled into its WebAssembly, as resolved by Cargo; macros and other crates used only while compiling put none of their code in it, so are left out. These dependencies have been checked and confirmed to use MIT or Unicode-3.0, all of which allow commercial use. All are used unmodified, so any licence conditions that apply only to modified versions are not triggered. Developers cloning this repository should independently verify development dependencies.

| Dependency                                                                                      | Version | License(s)                          | Document                                                                                                                                                                                                               |
| :---------------------------------------------------------------------------------------------- | :-----: | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@dpuse/dpuse-shared](https://github.com/dpuse/dpuse-shared)                                    |  1.0.2  | MIT                                 | [LICENSE](licenses/downloads/@dpuse/dpuse-shared@1.0.2-LICENSE.txt)                                                                                                                                                    |
| [cfg-if](https://github.com/rust-lang/cfg-if)                                                   |  1.0.4  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/cfg-if@1.0.4-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/cfg-if@1.0.4-LICENSE-MIT)                                                                                            |
| [console_error_panic_hook](https://github.com/rustwasm/console_error_panic_hook)                |  0.1.7  | Apache-2.0/MIT                      | [LICENSE-APACHE](licenses/downloads/console_error_panic_hook@0.1.7-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/console_error_panic_hook@0.1.7-LICENSE-MIT)                                                        |
| [csv-core](https://github.com/BurntSushi/rust-csv)                                              | 0.1.13  | Unlicense/MIT                       | [COPYING](licenses/downloads/csv-core@0.1.13-COPYING) [LICENSE-MIT](licenses/downloads/csv-core@0.1.13-LICENSE-MIT) [UNLICENSE](licenses/downloads/csv-core@0.1.13-UNLICENSE)                                          |
| [futures](https://github.com/rust-lang/futures-rs)                                              | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures@0.3.32-LICENSE-MIT)                                                                                        |
| [futures-channel](https://github.com/rust-lang/futures-rs)                                      | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-channel@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-channel@0.3.32-LICENSE-MIT)                                                                        |
| [futures-core](https://github.com/rust-lang/futures-rs)                                         | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-core@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-core@0.3.32-LICENSE-MIT)                                                                              |
| [futures-executor](https://github.com/rust-lang/futures-rs)                                     | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-executor@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-executor@0.3.32-LICENSE-MIT)                                                                      |
| [futures-io](https://github.com/rust-lang/futures-rs)                                           | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-io@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-io@0.3.32-LICENSE-MIT)                                                                                  |
| [futures-sink](https://github.com/rust-lang/futures-rs)                                         | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-sink@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-sink@0.3.32-LICENSE-MIT)                                                                              |
| [futures-task](https://github.com/rust-lang/futures-rs)                                         | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-task@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-task@0.3.32-LICENSE-MIT)                                                                              |
| [futures-util](https://github.com/rust-lang/futures-rs)                                         | 0.3.32  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/futures-util@0.3.32-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/futures-util@0.3.32-LICENSE-MIT)                                                                              |
| [js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)                | 0.3.91  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/js-sys@0.3.91-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/js-sys@0.3.91-LICENSE-MIT)                                                                                          |
| [memchr](https://github.com/BurntSushi/memchr)                                                  |  2.8.0  | Unlicense OR MIT                    | [COPYING](licenses/downloads/memchr@2.8.0-COPYING) [LICENSE-MIT](licenses/downloads/memchr@2.8.0-LICENSE-MIT) [UNLICENSE](licenses/downloads/memchr@2.8.0-UNLICENSE)                                                   |
| [once_cell](https://github.com/matklad/once_cell)                                               | 1.21.4  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/once_cell@1.21.4-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/once_cell@1.21.4-LICENSE-MIT)                                                                                    |
| [pin-project-lite](https://github.com/taiki-e/pin-project-lite)                                 | 0.2.17  | Apache-2.0 OR MIT                   | [LICENSE-APACHE](licenses/downloads/pin-project-lite@0.2.17-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/pin-project-lite@0.2.17-LICENSE-MIT)                                                                      |
| [serde](https://github.com/serde-rs/serde)                                                      | 1.0.228 | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/serde@1.0.228-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/serde@1.0.228-LICENSE-MIT)                                                                                          |
| [serde_core](https://github.com/serde-rs/serde)                                                 | 1.0.228 | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/serde_core@1.0.228-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/serde_core@1.0.228-LICENSE-MIT)                                                                                |
| [serde-wasm-bindgen](https://github.com/RReverser/serde-wasm-bindgen)                           |  0.6.5  | MIT                                 | [LICENSE](licenses/downloads/serde-wasm-bindgen@0.6.5-LICENSE)                                                                                                                                                         |
| [slab](https://github.com/tokio-rs/slab)                                                        | 0.4.12  | MIT                                 | [LICENSE](licenses/downloads/slab@0.4.12-LICENSE)                                                                                                                                                                      |
| [unicode-ident](https://github.com/dtolnay/unicode-ident)                                       | 1.0.24  | (MIT OR Apache-2.0) AND Unicode-3.0 | [LICENSE-APACHE](licenses/downloads/unicode-ident@1.0.24-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/unicode-ident@1.0.24-LICENSE-MIT) [LICENSE-UNICODE](licenses/downloads/unicode-ident@1.0.24-LICENSE-UNICODE) |
| [valibot](https://github.com/open-circle/valibot)                                               |  1.5.0  | MIT                                 | [LICENSE](licenses/downloads/valibot@1.5.0-LICENSE.txt)                                                                                                                                                                |
| [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)                                    | 0.2.114 | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/wasm-bindgen@0.2.114-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/wasm-bindgen@0.2.114-LICENSE-MIT)                                                                            |
| [wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures) | 0.4.64  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/wasm-bindgen-futures@0.4.64-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/wasm-bindgen-futures@0.4.64-LICENSE-MIT)                                                              |
| [wasm-bindgen-shared](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared)   | 0.2.114 | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/wasm-bindgen-shared@0.2.114-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/wasm-bindgen-shared@0.2.114-LICENSE-MIT)                                                              |
| [wasm-streams](https://github.com/MattiasBuelens/wasm-streams/)                                 |  0.4.2  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/wasm-streams@0.4.2-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/wasm-streams@0.4.2-LICENSE-MIT)                                                                                |
| [web-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys)              | 0.3.91  | MIT OR Apache-2.0                   | [LICENSE-APACHE](licenses/downloads/web-sys@0.3.91-LICENSE-APACHE) [LICENSE-MIT](licenses/downloads/web-sys@0.3.91-LICENSE-MIT)                                                                                        |

### Dependency Tree

The dependency tree below shows how each package in the table above is reached — direct and transitive — along with its installed version, release date, and update status. A package that does not ship itself, such as one whose parts are bundled separately, is left out and what ships beneath it is shown in its place. Packages flagged ❗ have a newer version available; ⚠️ indicates a package that hasn't been updated in the last 6 months or longer. Neither flag necessarily indicates a problem: we let new releases stabilise before upgrading, and some packages are mature and stable (have limited or no dependencies), so they require no active development.

- **[@dpuse/dpuse-shared](https://github.com/dpuse/dpuse-shared)** 1.0.2 — this month: 2026-10-03
    - **[valibot](https://github.com/open-circle/valibot)** 1.5.0 — this month: 2026-09-09
- **dpuse-tool-rust-csv-core-parser** 0.1.0 — this project's Rust code, compiled into its WebAssembly
    - **[console_error_panic_hook](https://github.com/rustwasm/console_error_panic_hook)** 0.1.7 — **59 months** ago: 2021-10-11 ⚠️
        - **[cfg-if](https://github.com/rust-lang/cfg-if)** 1.0.4 — **11 months** ago: 2025-10-15 ⚠️ → **latest**: 1.0.5 — this month: 2026-09-16 ❗
        - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
            - **[cfg-if](https://github.com/rust-lang/cfg-if)** 1.0.4 — **11 months** ago: 2025-10-15 ⚠️ → **latest**: 1.0.5 — this month: 2026-09-16 ❗
            - **[once_cell](https://github.com/matklad/once_cell)** 1.21.4 — **6 months** ago: 2026-03-12
            - **[wasm-bindgen-shared](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
                - **[unicode-ident](https://github.com/dtolnay/unicode-ident)** 1.0.24 — **7 months** ago: 2026-02-16 ⚠️ → **latest**: 1.0.26 — this month: 2026-09-17 ❗
    - **[csv-core](https://github.com/BurntSushi/rust-csv)** 0.1.13 — **11 months** ago: 2025-10-17 ⚠️
        - **[memchr](https://github.com/BurntSushi/memchr)** 2.8.0 — **7 months** ago: 2026-02-06 ⚠️ → **latest**: 2.8.3 — **2 months** ago: 2026-07-08 ❗
    - **[futures](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-channel](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
            - **[futures-core](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
            - **[futures-sink](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-core](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-executor](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
            - **[futures-core](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
            - **[futures-task](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
            - **[futures-util](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[futures-channel](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[futures-core](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[futures-io](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[futures-sink](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[futures-task](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
                - **[memchr](https://github.com/BurntSushi/memchr)** 2.8.0 — **7 months** ago: 2026-02-06 ⚠️ → **latest**: 2.8.3 — **2 months** ago: 2026-07-08 ❗
                - **[pin-project-lite](https://github.com/taiki-e/pin-project-lite)** 0.2.17 — **7 months** ago: 2026-02-27 ⚠️
                - **[slab](https://github.com/tokio-rs/slab)** 0.4.12 — **8 months** ago: 2026-01-31 ⚠️
        - **[futures-io](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-sink](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-task](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[futures-util](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
    - **[js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
        - **[once_cell](https://github.com/matklad/once_cell)** 1.21.4 — **6 months** ago: 2026-03-12
        - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
    - **[serde](https://github.com/serde-rs/serde)** 1.0.228 — **12 months** ago: 2025-09-27 ⚠️ → **latest**: 1.0.229 — **2 months** ago: 2026-07-18 ❗
        - **[serde_core](https://github.com/serde-rs/serde)** 1.0.228 — **12 months** ago: 2025-09-27 ⚠️ → **latest**: 1.0.229 — **2 months** ago: 2026-07-18 ❗
    - **[serde-wasm-bindgen](https://github.com/RReverser/serde-wasm-bindgen)** 0.6.5 — **31 months** ago: 2024-02-27 ⚠️
        - **[js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
        - **[serde](https://github.com/serde-rs/serde)** 1.0.228 — **12 months** ago: 2025-09-27 ⚠️ → **latest**: 1.0.229 — **2 months** ago: 2026-07-18 ❗
        - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
    - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
    - **[wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures)** 0.4.64 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.4.79 — this month: 2026-09-25 ❗
        - **[cfg-if](https://github.com/rust-lang/cfg-if)** 1.0.4 — **11 months** ago: 2025-10-15 ⚠️ → **latest**: 1.0.5 — this month: 2026-09-16 ❗
        - **[futures-util](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
        - **[once_cell](https://github.com/matklad/once_cell)** 1.21.4 — **6 months** ago: 2026-03-12
        - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
    - **[wasm-streams](https://github.com/MattiasBuelens/wasm-streams/)** 0.4.2 — **23 months** ago: 2024-10-25 ⚠️ → **latest**: 0.7.0 — this month: 2026-09-14 ❗
        - **[futures-util](https://github.com/rust-lang/futures-rs)** 0.3.32 — **7 months** ago: 2026-02-15 ⚠️ → **latest**: 0.3.34 — **1 month** ago: 2026-08-11 ❗
        - **[js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
        - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗
        - **[wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures)** 0.4.64 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.4.79 — this month: 2026-09-25 ❗
        - **[web-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
            - **[js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys)** 0.3.91 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.3.106 — this month: 2026-09-25 ❗
            - **[wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen)** 0.2.114 — **7 months** ago: 2026-02-27 ⚠️ → **latest**: 0.2.129 — this month: 2026-09-25 ❗

<!-- DEPENDENCY_LICENSES_END -->

<!-- BUNDLE_START -->

## Bundle Analysis

This report is updated with each release, from the bundle the release builds, using [Sonda](https://sonda.dev/), which analyses final source maps to reveal the actual effects of tree-shaking and minification rather than relying on pre-build estimates.

_Note: Sonda's Vite reports currently exclude CSS files, since Vite does not generate source maps for CSS._

| Chunk/Module/File                                                     | Composition                                  |
| :-------------------------------------------------------------------- | :------------------------------------------- |
| **dist/dpuse_tool_rust_csv_core_parser-IBWkPQdP.js**                  | 131.7 kB · gzip 53.4 kB · 92.5% of the build |
| &nbsp;&nbsp;&nbsp;&nbsp;wasm → ….js                                   | `████████████████████` 99.0% · 130.4 kB      |
| &nbsp;&nbsp;&nbsp;&nbsp;(bundler output, whitespace & JSON)           | `░░░░░░░░░░░░░░░░░░░░` 1.0% · 1.3 kB         |
| **dist/dpuse-tool-rust-csv-core-parser.es.js**                        | 10.7 kB · gzip 3.3 kB · 7.5% of the build    |
| &nbsp;&nbsp;&nbsp;&nbsp;@dpuse/dpuse-shared → dist/dpuse-shared.es.js | `███████████████░░░░░` 73.7% · 7.9 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;src → index.ts                                | `███░░░░░░░░░░░░░░░░░` 13.9% · 1.5 kB        |
| &nbsp;&nbsp;&nbsp;&nbsp;(bundler output, whitespace & JSON)           | `██░░░░░░░░░░░░░░░░░░` 12.4% · 1.3 kB        |

Bars show each row's share of its output file.

(bundler output, whitespace & JSON) = bytes Sonda can't trace to a source file: whitespace (indentation and line breaks), code the bundler generates (region comments, the combined import/export lines, its small runtime helper and wrappers), and imported JSON such as `config.json`, which the bundler doesn't map. The JSON and the generated code are real bytes that ship; the whitespace mostly disappears once compressed.

<!-- BUNDLE_END -->

<!-- QUALITY_SECURITY_START -->

## Quality & Security

This section is updated each time `npm run document` is run. Settings come from the repository's workflow files and GitHub. Test coverage and the Fallow score are measured at the same time.

### Testing

| Check                | Status | What it does                                                                                                                                                                                             |
| :------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests           | ✅ On  | [Vitest](https://vitest.dev) runs the unit tests. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/ci.yml) on every push and pull request to `main`. |
| Property-based tests | ❌ Off | [fast-check](https://fast-check.dev) runs many random inputs per test to find edge cases, alongside the unit tests.                                                                                      |

### Code Quality

| Check         | Status | What it does                                                                                                                                                                                                                       |
| :------------ | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code analysis | ❌ Off | [SonarCloud](https://sonarcloud.io) checks every push for bugs, code smells and vulnerabilities.                                                                                                                                   |
| Linting       | ✅ On  | [ESLint](https://eslint.org) checks the code for errors and style problems. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/ci.yml) on every push and pull request to `main`. |

### Security Analysis

| Check           | Status | What it does                                                                                                                                                                                                                                                                                                                                                                                                      |
| :-------------- | :----- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push protection | ✅ On  | [GitHub push protection](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations) blocks pushes that contain credentials.                                                                                                                                                                                                                                     |
| Static analysis | ✅ On  | [![CodeQL](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/codeql.yml/badge.svg)](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/security/code-scanning) [CodeQL](https://codeql.github.com) scans GitHub Actions and JavaScript/TypeScript and Rust for security vulnerabilities, using the extended security queries, on every push and pull request to `main` and weekly. |
| Secret scanning | ✅ On  | [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning) detects credentials, such as API keys and tokens, committed to the repository.                                                                                                                                                                                                                                                 |

### Dependencies

| Check               | Status | What it does                                                                                                                                                                                                                                                                                                                           |
| :------------------ | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerability audit | ✅ On  | [npm audit](https://docs.npmjs.com/cli/commands/npm-audit) fails when a shipped dependency has any known vulnerability, or a development dependency has a high or critical one. Part of the [CI workflow](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/actions/workflows/ci.yml) on every push and pull request to `main`. |
| Supply chain risk   | ✅ On  | [Socket](https://socket.dev) flags malicious packages, typosquatting and suspicious behaviour that may not yet have a CVE.                                                                                                                                                                                                             |
| Security alerts     | ✅ On  | [Dependabot](https://docs.github.com/en/code-security/dependabot) alerts when a dependency has a known vulnerability, using the GitHub Advisory Database.                                                                                                                                                                              |
| Security updates    | ❌ Off | [Dependabot](https://docs.github.com/en/code-security/dependabot) opens pull requests that update vulnerable dependencies. These are handled manually.                                                                                                                                                                                 |
| Version updates     | ❌ Off | [Dependabot](https://docs.github.com/en/code-security/dependabot) opens pull requests for new dependency versions. These are handled manually.                                                                                                                                                                                         |

### OpenSSF 🚧

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/dpuse/dpuse-tool-rust-csv-core-parser/badge)](https://scorecard.dev/viewer/?uri=github.com/dpuse/dpuse-tool-rust-csv-core-parser)

This project is working towards the [OpenSSF Best Practices](https://www.bestpractices.dev) Passing badge, a self-certification covering security policy, vulnerability reporting, build processes, code quality, and more. Currently the [OpenSSF Scorecard](https://scorecard.dev) provides an independent automated assessment of the project's security practices and is an ongoing area of improvement.

### Reporting Vulnerabilities

Please do not open public GitHub issues for security vulnerabilities. Use [GitHub private vulnerability reporting](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/security/advisories/new) instead. See [SECURITY.md](./SECURITY.md) for the full disclosure policy, contact details, and expected response times.

<!-- QUALITY_SECURITY_END -->

<!-- CONTRIBUTING_LICENSE_START -->

## Contributing

This repository is maintained solely by its owner and does not, at present, accept external contributions into the canonical repo. Its source is published openly under the MIT License — every DPUse project is fully open source except DPUse Engine, which remains closed and proprietary.

For security vulnerabilities, see [Reporting Vulnerabilities](#reporting-vulnerabilities). For bugs, inconsistencies, or other feedback, [open a GitHub issue](https://github.com/dpuse/dpuse-tool-rust-csv-core-parser/issues) — feedback is read, but responses and fixes are at the maintainer's discretion.

## License

This project is licensed under the MIT License, permitting free use, modification, and distribution.

[MIT](./LICENSE) © 2026 Jonathan Terrell

<!-- CONTRIBUTING_LICENSE_END -->
