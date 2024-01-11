import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import styleX from 'vite-plugin-stylex';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  ssr: {
    external: ['@stylexjs/stylex'],
  },
  plugins: [
    vanillaExtractPlugin({ emitCssInSsr: true }),
    styleX(),
    commonjs({
      filter(id: string) {
        // `node_modules` is exclude by default, so we need to include it explicitly
        // https://github.com/vite-plugin/vite-plugin-commonjs/blob/v0.7.0/src/index.ts#L125-L127
        if (id.includes('node_modules/classnames')) {
          return true;
        }
      },
    }),
  ],
});
