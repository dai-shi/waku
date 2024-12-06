import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [
    {
      name: 'hack-css-plugin-needed-for-stylex-dev-FIXME',
      resolveId(id: string) {
        if (id.endsWith('.css') && !id.endsWith('.vanilla.css')) {
          return id;
        }
      },
    },
    vanillaExtractPlugin(),
    stylexPlugin(),
  ],
};
