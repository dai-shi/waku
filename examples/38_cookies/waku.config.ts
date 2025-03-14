import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: [
    'waku/middleware/context',
    './src/middleware/cookie.js',
    'waku/middleware/dev-server',
    'waku/middleware/handler',
  ],
});
