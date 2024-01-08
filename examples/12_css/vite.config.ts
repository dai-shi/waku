import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import commonjs from 'vite-plugin-commonjs';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

export default defineConfig({
  ssr: {
    external: ['@stylexjs/stylex'],
  },
  plugins: [
    vanillaExtractPlugin({ emitCssInSsr: true }),
    // @ts-expect-error not callable FIXME why not callable?
    commonjs({
      filter(id: string) {
        // `node_modules` is exclude by default, so we need to include it explicitly
        // https://github.com/vite-plugin/vite-plugin-commonjs/blob/v0.10.1/src/index.ts#L141-L142
        if (id.includes('node_modules/classnames')) {
          return true;
        }
      },
    }),
    stylexPlugin(),
  ],
});
