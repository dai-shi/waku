import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: ['minimal/client', 'minimal/server', 'client', 'server'].map(
      (entry) => ({
        find: new RegExp(`^waku/${entry}$`),
        replacement: fileURLToPath(
          new URL(`./src/${entry}.ts`, import.meta.url),
        ),
      }),
    ),
  },
});
