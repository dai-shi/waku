import type { IncomingMessage, ServerResponse } from 'node:http';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';

import { honoMiddleware } from '../middleware/hono-prd.js';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env: Record<string, string> = process.env as any;

const app = new Hono();
app.use('*', honoMiddleware({ loadEntries, env }));
const requestListener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  requestListener(req, res);
}
