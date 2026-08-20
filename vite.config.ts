// ── External Dependencies & Registrations
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import Sonda from 'sonda/vite';
import { fileURLToPath, URL } from 'node:url';

// ── Data
import config from './config.json';

// ── Vite Configuration ───────────────────────────────────────────────────────────────────────────────────────────────

export default defineConfig({
    build: {
        lib: {
            entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
            fileName: (format) => `${config.id}.${format}.js`,
            formats: ['es']
        },
        rollupOptions: {
            external: ['@dpuse/dpuse-shared', /^https:\/\/engine-eu\.dpuse\.app\//],
            plugins: [Sonda({ filename: 'index', format: 'json', brotli: true, gzip: false, open: false, outputDir: './bundle-analysis-reports/sonda' })]
        },
        sourcemap: 'hidden',
        target: 'ESNext'
    },
    plugins: [dts({ outDirs: 'dist/types', entryRoot: 'src' })],
    resolve: {
        alias: {
            '~': fileURLToPath(new URL('./', import.meta.url)),
            '@': fileURLToPath(new URL('src', import.meta.url))
        }
    }
});
