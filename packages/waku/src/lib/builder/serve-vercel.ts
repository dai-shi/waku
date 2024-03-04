import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';

import { runner } from '../hono/runner.js';

const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR!;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR!;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const ssr: boolean = import.meta.env.WAKU_SSR === 'true';
const env: Record<string, string> = process.env as any;

const app = new Hono();
app.use('*', runner({ ssr, cmd: 'start', loadEntries, env }));
app.notFound((c) => {
  // FIXME better implementation using node stream?
  const file = path.join(distDir, publicDir, '404.html');
  if (existsSync(file)) {
    return c.html(readFileSync(file, 'utf8'), 404);
  }
  return c.text('404 Not Found', 404);
});
const requestListener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return requestListener(req, res);
}
