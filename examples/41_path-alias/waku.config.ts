import { fileURLToPath } from 'node:url';
import { defineConfig } from 'waku/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [
        tsconfigPaths({ root: fileURLToPath(new URL('.', import.meta.url)) }),
      ],
    }),
  },
});
