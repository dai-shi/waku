import { defineConfig } from 'waku/config';
import react from '@vitejs/plugin-react';

const ReactCompilerConfig = {};

const getConfig = () => ({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
      },
    }),
  ],
});

export default defineConfig({
  unstable_viteConfigs: {
    'dev-main': getConfig,
    'build-client': getConfig,
  },
});
