import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  // Keep the published entry at `lib/index.js`; tsdown defaults to `.mjs`.
  outExtensions: () => ({ js: '.js' }),
  // Declarations are emitted by `tsc -p tsconfig.build.json`; tsdown's own dts
  // step depends on a `tsgo` binary this toolchain does not provide.
  dts: false,
  clean: true,
})
