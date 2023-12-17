import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import styleX from 'vite-plugin-stylex';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  plugins: [
    vanillaExtractPlugin({ emitCssInSsr: true }),
    commonjs({
      filter(id) {
        if (
          id.includes('node_modules/@stylexjs') ||
          id.includes('node_modules/styleq')
        ) {
          return true;
        }
      },
    }),
    styleX(),
  ],
});
