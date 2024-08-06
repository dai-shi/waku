/** @type {import('waku/config').Config} */
export default {
  middleware: () => [
    import('./src/middleware/cookie.js'),
    import('waku/middleware/dev-server'),
    import('waku/middleware/headers'),
    import('waku/middleware/rsc'),
    import('waku/middleware/ssr'),
  ],
};
