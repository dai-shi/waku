import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-pages';

import { runner } from '../hono/runner.js';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof runner> | undefined;

const app = new Hono();
app.use('/assets/*', serveStatic());
app.use('*', (c, next) => serveWaku!(c, next));
app.notFound(async (c) => {
  return c.text('404 Not Found', 404);
});

export default {
  async fetch(
    request: Request,
    env: Record<string, string>,
    ctx: Parameters<typeof app.fetch>[2],
  ) {
    if (!serveWaku) {
      serveWaku = runner({ cmd: 'start', loadEntries, env });
    }
    return app.fetch(request, env, ctx);
  },
};
