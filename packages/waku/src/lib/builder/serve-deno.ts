/* eslint import/no-unresolved: off */

// @ts-expect-error no types
import { Hono } from 'https://deno.land/x/hono/mod.ts';
// @ts-expect-error no types
import { serveStatic } from 'https://deno.land/x/hono/middleware.ts';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
// @ts-expect-error no types
const env = Deno.env.toObject();

const app = new Hono();
app.use('*', serveStatic({ root: `${distDir}/${publicDir}` }));
app.use('*', honoMiddleware({ loadEntries, ssr, env }));

// @ts-expect-error no types
Deno.serve(app.fetch);
