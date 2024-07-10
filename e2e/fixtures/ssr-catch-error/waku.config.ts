const DO_NOT_BUNDLE = '';

/** @type {import('waku/config').Config} */
export default {
  middleware: (cmd: 'dev' | 'start') => [
    ...(cmd === 'dev'
      ? [
          import(
            /* @vite-ignore */ DO_NOT_BUNDLE + 'waku/middleware/dev-server'
          ),
        ]
      : []),
    import('./src/middleware/validator.js'),
    import('waku/middleware/rsc'),
    import('waku/middleware/fallback'),
  ],
  /**
   * Prefix for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscPath: 'RSC', // Just for clarification in tests
};
