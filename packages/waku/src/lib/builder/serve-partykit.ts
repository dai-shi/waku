import { Hono } from 'hono';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof honoMiddleware> | undefined;

const app = new Hono();
app.use('*', (c, next) => serveWaku!(c, next));
app.notFound(async (c) => {
  // @ts-expect-error partykit's types aren't available
  const assetsFetcher = c.env.assets as {
    fetch(url: string): Promise<Response | undefined>;
  };
  // check if there's a 404.html in the static assets
  const notFoundStaticAssetResponse = await assetsFetcher.fetch('/404.html');
  // if there is, return it
  if (notFoundStaticAssetResponse) {
    return new Response(notFoundStaticAssetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: notFoundStaticAssetResponse.headers,
    });
  }
  // otherwise, return a simple 404 response
  return c.text('404 Not Found', 404);
});

export default {
  onFetch(request: Request, lobby: any, ctx: Parameters<typeof app.fetch>[2]) {
    if (!serveWaku) {
      serveWaku = honoMiddleware({ loadEntries, ssr, env: lobby });
    }
    return app.fetch(request, lobby, ctx);
  },
};
