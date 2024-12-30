import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: () => [
    import('waku/middleware/context'),
    import('waku/middleware/dev-server'),
    import('./src/middleware/validator.js'),
    import('waku/middleware/handler'),
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
