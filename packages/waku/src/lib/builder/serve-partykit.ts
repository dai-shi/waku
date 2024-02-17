import { Hono } from 'hono';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof honoMiddleware> | undefined;

const app = new Hono();
app.use('*', (c, next) => serveWaku!(c, next));

export default {
  onFetch(request: Request, lobby: any, ctx: Parameters<typeof app.fetch>[2]) {
    if (!serveWaku) {
      serveWaku = honoMiddleware({ loadEntries, ssr, env: lobby });
    }
    return app.fetch(request, lobby, ctx);
  },
};
