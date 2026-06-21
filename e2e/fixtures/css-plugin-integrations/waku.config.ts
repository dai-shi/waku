import stylex from '@stylexjs/unplugin/vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      vanillaExtractPlugin(),
      stylex({
        debug: process.env.NODE_ENV === 'development',
        treeshakeCompensation: true,
        useCSSLayers: true,
        devMode: 'css-only',
        runtimeInjection: false,
      }),
      react(),
    ],
  },
});
