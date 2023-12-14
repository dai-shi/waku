import url from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default defineConfig({
  root: path.dirname(url.fileURLToPath(import.meta.url)),
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true })],
});
