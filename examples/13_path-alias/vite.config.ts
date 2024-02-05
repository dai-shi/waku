import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [
    tsconfigPaths({
      root: fileURLToPath(new URL('.', import.meta.url)),
    }),
  ],
};
