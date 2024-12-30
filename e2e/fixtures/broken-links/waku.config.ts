import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: () => [
    import('waku/middleware/context'),
    import('./src/redirects.js'),
    import('waku/middleware/dev-server'),
    import('waku/middleware/handler'),
  ],
});
