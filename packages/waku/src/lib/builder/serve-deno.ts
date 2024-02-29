/* eslint import/no-unresolved: off */

// @ts-expect-error no types
import { Hono } from 'https://deno.land/x/hono/mod.ts';
// @ts-expect-error no types
import { serveStatic } from 'https://deno.land/x/hono/middleware.ts';

import { honoMiddleware } from '../old-wrappers/hono-prd.js';

declare const Deno: any;

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env = Deno.env.toObject();

const app = new Hono();
app.use('*', serveStatic({ root: `${distDir}/${publicDir}` }));
app.use('*', honoMiddleware({ loadEntries, ssr, env }));
app.notFound(async (c: any) => {
  const file = `${distDir}/${publicDir}/404.html`;
  const info = await Deno.stat(file);
  if (info.isFile) {
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.body(await Deno.readFile(file), 404);
  }
  return c.text('404 Not Found', 404);
});

Deno.serve(app.fetch);
