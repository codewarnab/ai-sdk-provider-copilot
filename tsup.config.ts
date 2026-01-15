import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false, // TODO: Enable when @github/copilot-sdk ships proper .d.ts files
    clean: true,
    sourcemap: true,
    splitting: false,
});
