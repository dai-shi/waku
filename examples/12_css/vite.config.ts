import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { stylexPlugin } from 'vite-plugin-stylex-dev';

export default defineConfig(({ mode }) => ({
  ...(mode === 'development' && {
    ssr: {
      external: ['@stylexjs/stylex', 'classnames'],
    },
  }),
  plugins: [vanillaExtractPlugin({ emitCssInSsr: true }), stylexPlugin()],
}));
