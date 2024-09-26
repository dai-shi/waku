import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [
    {
      name: 'hack-css-plugin-why-do-we-need-this-FIXME',
      resolveId(id: string) {
        if (id.endsWith('.css')) {
          return id;
        }
      },
    },
    vanillaExtractPlugin(),
    stylexPlugin(),
  ],
};
