import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import styleX from 'vite-plugin-stylex';

export default defineConfig({
  ssr: {
    external: ['@stylexjs/stylex'],
  },
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true }), styleX()],
});
