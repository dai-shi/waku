import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: [
    'waku/middleware/context',
    'waku/middleware/dev-server',
    './src/middleware/validator.js',
    'waku/middleware/handler',
  ],
  /**
   * Base path for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscBase: 'RSC', // Just for clarification in tests
  unstable_viteConfigs: {
    common: () => ({
      ssr: {
        resolve: {
          // FIXME Ideally, we shouldn't need this.
          conditions: ['module', 'node'],
        },
      },
    }),
  },
});
