import { Hono } from 'hono';
import type { Context } from '@netlify/functions';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env: Record<string, string> = process.env as any;

const app = new Hono();
app.use('*', honoMiddleware({ loadEntries, ssr, env }));

export default async (req: Request, context: Context) =>
  app.fetch(req, { context });
