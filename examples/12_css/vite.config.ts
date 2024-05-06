import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylex } from 'vite-plugin-stylex-dev';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [vanillaExtractPlugin(), stylex()],
};
