import { Hono } from 'hono';
import { runner } from '../hono/runner.js';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof runner> | undefined;

export interface CloudflareEnv {
  ASSETS: {
    fetch: (input: RequestInit | URL, init?: RequestInit) => Promise<Response>;
  };
}

export const app = new Hono<{
  Bindings: CloudflareEnv & { [k: string]: unknown };
}>();
app.use('*', (c, next) => serveWaku!(c, next));
app.notFound(async (c) => {
  const assetsFetcher = c.env.ASSETS;
  const url = new URL(c.req.raw.url);
  const errorHtmlUrl = `${url.origin}/404.html`;
  const notFoundStaticAssetResponse = await assetsFetcher.fetch(
    new URL(errorHtmlUrl),
  );
  if (notFoundStaticAssetResponse && notFoundStaticAssetResponse.status < 400) {
    return c.body(notFoundStaticAssetResponse.body, 404);
  }
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
