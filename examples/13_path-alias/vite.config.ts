import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: fileURLToPath(import.meta.url),
    }),
  ],
});
