import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/cache/index.ts', 'src/propagation/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: true,
    treeshake: true,
});
