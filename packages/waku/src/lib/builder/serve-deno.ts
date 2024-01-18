/* eslint import/no-unresolved: off */

// @ts-expect-error no types
import { Hono } from 'https://deno.land/x/hono/mod.ts';
// @ts-expect-error no types
import { serveStatic } from 'https://deno.land/x/hono/middleware.ts';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const entriesJs = import.meta.env.WAKU_CONFIG_ENTRIES_JS;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(`./${entriesJs}`);
// @ts-expect-error no types
const env = Deno.env.toObject();

const app = new Hono();
app.use('*', honoMiddleware({ loadEntries, ssr, env }));
app.use('*', serveStatic({ root: publicDir }));

// @ts-expect-error no types
Deno.serve(app.fetch);
