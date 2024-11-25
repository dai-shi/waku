import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: () => [
    import('waku/middleware/context'),
    import('waku/middleware/dev-server'),
    import('waku/middleware/handler'),
    import('waku/middleware/fallback'),
  ],
});
