import { Hono } from 'hono';
import type { Context } from '@netlify/functions';

import { runner } from '../hono/runner.js';

const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env: Record<string, string> = process.env as any;

const app = new Hono();
app.use('*', runner({ cmd: 'start', loadEntries, env }));
app.notFound((c) => {
  const notFoundHtml = (globalThis as any).__WAKU_NOT_FOUND_HTML__;
  if (typeof notFoundHtml === 'string') {
    return c.html(notFoundHtml, 404);
  }
  return c.text('404 Not Found', 404);
});

export default async (req: Request, context: Context) =>
  app.fetch(req, { context });
