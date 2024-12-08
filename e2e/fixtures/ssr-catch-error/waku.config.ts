/** @type {import('waku/config').Config} */
export default {
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
};
