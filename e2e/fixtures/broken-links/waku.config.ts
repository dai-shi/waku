import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: [
    'waku/middleware/context',
    './src/redirects.js',
    'waku/middleware/dev-server',
    'waku/middleware/handler',
  ],
});
