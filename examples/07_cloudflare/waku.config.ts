import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_honoEnhancer: './waku.hono-enhancer',
  middleware: [
    'waku/middleware/context',
    'waku/middleware/dev-server',
    './waku.cloudflare-middleware',
    'waku/middleware/handler',
  ],
});
