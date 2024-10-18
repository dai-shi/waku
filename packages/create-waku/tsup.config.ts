import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  minify: !options.watch,
  /** @see https://github.com/egoist/tsup/issues/927#issuecomment-2354939322 */
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
}));
