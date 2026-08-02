# Data Positioning Rust CSV Core Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A high-performance CSV parsing tool with Rust/WebAssembly core for the Data Positioning platform. Provides streaming CSV processing with automatic fallback for browsers without transferable ReadableStream support.

## Features

- **High Performance**: Rust/WASM core using `csv-core` for efficient parsing
- **Dual Mode Processing**:
    - **Stream Mode**: For Chromium-based browsers with transferable ReadableStream support
    - **Chunk Mode**: Fallback for Safari (iOS & macOS) without transferable stream support
- **Progressive Callbacks**: Real-time progress updates during processing
- **Single Load**: Dynamically loaded once and shared across all connectors
- **Memory Efficient**: Streaming architecture processes large files without loading entire content into memory

## Architecture

The tool encapsulates:

- **Rust Core** (`rust/dpuse_tool_rust_csv_core_parser`): Low-level CSV parsing with `csv-core`
- **TypeScript Wrapper** (`src/index.ts`): Browser-friendly API with automatic mode selection
- **WASM Binary**: Compiled once, bundled with the tool

## Usage

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

## Building

```bash
# Install dependencies
npm install

# Build Rust WASM module
npm run build:wasm

# Build TypeScript + bundle WASM
npm run build
```

## Development

**Prerequisites:**

- Node.js 18+
- Rust toolchain
- `wasm-pack` CLI: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`

**Structure:**

```
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

## License

[MIT](./LICENSE) © 2026 Data Positioning Pty Ltd
