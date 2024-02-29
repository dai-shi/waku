import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { serveStatic } from '@hono/node-server/serve-static';

import { honoMiddleware } from '../old-wrappers/hono-prd.js';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = process.env?.WAKU_BUILD_DIST_DIR ?? '';
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR!;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);

const env = process.env as Record<string, string>;

const app = new Hono();
app.use('*', serveStatic({ root: `${distDir}/${publicDir}` }));
app.use('*', honoMiddleware({ loadEntries, ssr, env }));
app.notFound(async (c) => {
  const file = path.join(distDir, publicDir, '404.html');
  if (existsSync(file)) {
    return c.html(readFileSync(file, 'utf8'), 404);
  }
  return c.text('404 Not Found', 404);
});

export const handler = handle(app);
