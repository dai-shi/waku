import { Hono } from 'hono';
import { unstable_getPlatformObject } from 'waku/server';
import { runner } from '../hono/runner.js';
import type {
  ExportedHandler,
  fetch,
  Request as CloudflareRequest,
  Response as CloudflareResponse,
} from '@cloudflare/workers-types/experimental';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof runner> | undefined;

export interface CloudflareEnv {
  ASSETS: {
    fetch: typeof fetch;
  };
}

export const app = new Hono<{
  Bindings: CloudflareEnv & { [k: string]: unknown };
}>();
app.use('*', (c, next) => {
  if (!serveWaku) {
    throw new Error('serveWaku is not initialized');
  }
  const platform = unstable_getPlatformObject();
  platform.honoContext = c;
  platform.cf = (c.req.raw as unknown as CloudflareRequest).cf;
  platform.env = c.env;
  platform.executionContext = c.executionCtx;
  return serveWaku(c, next);
});
app.notFound(async (c) => {
  const assetsFetcher = c.env.ASSETS;
  const url = new URL(c.req.raw.url);
  const errorHtmlUrl = `${url.origin}/404.html`;
  const notFoundStaticAssetResponse = (await assetsFetcher.fetch(
    new URL(errorHtmlUrl),
  )) as unknown as Response;
  if (notFoundStaticAssetResponse && notFoundStaticAssetResponse.status < 400) {
    return c.body(notFoundStaticAssetResponse.body, 404);
  }
  return c.text('404 Not Found', 404);
});

// Waku getEnv only supports strings
// Cloudflare injects bindings to env and JSON
// Use unstable_getPlatformObject() to access cloudflare env and execution context
// https://developers.cloudflare.com/workers/configuration/environment-variables/#add-environment-variables-via-wrangler
// https://developers.cloudflare.com/workers/runtime-apis/bindings/
const extractWakuEnv = (env: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>;

const handler: ExportedHandler<CloudflareEnv & { [k: string]: never }> = {
  async fetch(request, env, ctx) {
    if (!serveWaku) {
      serveWaku = runner({
        cmd: 'start',
        loadEntries,
        env: extractWakuEnv(env),
      });
    }
    return app.fetch(
      request as unknown as Request,
      env,
      ctx,
    ) as unknown as CloudflareResponse;
  },
  // TODO ability to add other handlers or Durable Objects?
};

export default handler;
