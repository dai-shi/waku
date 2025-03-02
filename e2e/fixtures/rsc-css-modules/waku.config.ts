import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: [
    'waku/middleware/context',
    'waku/middleware/dev-server',
    'waku/middleware/handler',
    'waku/middleware/fallback',
  ],
});
