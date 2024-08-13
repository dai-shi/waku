import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: () => [
    import('waku/middleware/dev-server'),
    import('waku/middleware/rsc'),
    import('waku/middleware/fallback'),
  ],
});
