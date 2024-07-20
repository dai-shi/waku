/** @type {import('waku/config').Config} */
export default {
  middleware: () => [
    import('./src/middleware/api.js'),
    import('waku/middleware/dev-server'),
    import('waku/middleware/headers'),
    import('waku/middleware/ssr'),
    import('waku/middleware/rsc'),
  ],
};
