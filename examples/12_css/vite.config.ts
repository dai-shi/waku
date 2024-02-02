import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

export default defineConfig({
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true }), stylexPlugin()],
});
