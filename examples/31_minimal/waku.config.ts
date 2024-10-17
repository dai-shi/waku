/** @type {import('waku/config').Config} */
export default {
  middleware: () => [
    import('waku/middleware/context'),
    import('waku/middleware/dev-server'),
    import('waku/middleware/handler'),
    import('waku/middleware/fallback'),
  ],
};
