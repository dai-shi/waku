import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
// @ts-expect-error no types
// eslint-disable-next-line import/no-unresolved
import manifest from '__STATIC_CONTENT_MANIFEST';

import { runner } from '../hono/runner.js';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
let serveWaku: ReturnType<typeof runner> | undefined;
let staticContent: any;

const parsedManifest: Record<string, string> = JSON.parse(manifest);

const app = new Hono();
app.use('*', serveStatic({ root: './', manifest }));
app.use('*', (c, next) => serveWaku!(c, next));
app.notFound(async (c) => {
  const path = parsedManifest['404.html'];
  const content: ArrayBuffer | undefined =
    path && (await staticContent?.get(path, { type: 'arrayBuffer' }));
  if (content) {
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.body(content, 404);
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
      staticContent = env.__STATIC_CONTENT;
    }
    return app.fetch(request, env, ctx);
  },
};
