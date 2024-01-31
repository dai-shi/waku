import type { IncomingMessage, ServerResponse } from 'node:http';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';

import { honoMiddleware } from '../middleware/hono-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env: Record<string, string> = process.env as any;

const app = new Hono();
app.use('*', honoMiddleware({ loadEntries, ssr, env }));
const requestListener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  requestListener(req, res);
}
