/** @type {import('waku/config').Config} */
export default {
  middleware: (cmd: 'dev' | 'start') => [
    ...(cmd === 'dev'
      ? [
          import(
            /* @vite-ignore */ 'DO_NOT_BUNDLE'.slice(Infinity) +
              'waku/middleware/dev-server'
          ),
        ]
      : []),
    import('waku/middleware/rsc'),
    import('waku/middleware/fallback'),
  ],
};
