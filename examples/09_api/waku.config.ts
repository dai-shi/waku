const DO_NOT_BUNDLE = '';

/** @type {import('waku/config').Config} */
export default {
  middleware: (cmd: 'dev' | 'start') => [
    import('./src/middleware/api.js'),
    ...(cmd === 'dev'
      ? [
          import(
            /* @vite-ignore */ DO_NOT_BUNDLE + 'waku/middleware/dev-server'
          ),
        ]
      : []),
    import('waku/middleware/headers'),
    import('waku/middleware/ssr'),
    import('waku/middleware/rsc'),
  ],
};
