import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true }), stylexPlugin()],
};
