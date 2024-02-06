import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { serveStatic } from '@hono/node-server/serve-static';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);

const env = process.env as Record<string, string>;

const app = new Hono();
app.use('*', serveStatic({ root: `${distDir}/${publicDir}` }));
app.use('*', honoMiddleware({ loadEntries, ssr, env }));

export const handler = handle(app);
