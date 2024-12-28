import { fileURLToPath } from 'node:url';
import { defineConfig } from 'waku/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const getConfig = () => ({
  ssr: {
    external: ['vite-tsconfig-paths'],
  },
  plugins: [
    tsconfigPaths({ root: fileURLToPath(new URL('.', import.meta.url)) }),
  ],
});

export default defineConfig({
  unstable_viteConfigs: {
    'dev-main': getConfig,
    'dev-rsc': getConfig,
    'build-analyze': getConfig,
    'build-server': getConfig,
    'build-ssr': getConfig,
    'build-client': getConfig,
  },
});
