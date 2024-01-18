import path from 'node:path';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { connectMiddleware } from '../middleware/connect-prd.js';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const indexHtml = import.meta.env.WAKU_CONFIG_INDEX_HTML;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
const env: Record<string, string> = process.env as any;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  connectMiddleware({ loadEntries, ssr, env })(req, res, () => {
    const { pathname } = new URL(req.url!, 'http://localhost');
    const fname = path.join(
      `${distDir}`,
      `${publicDir}`,
      pathname,
      path.extname(pathname) ? '' : `${indexHtml}`,
    );
    if (fs.existsSync(fname)) {
      if (fname.endsWith('.html')) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
      } else if (fname.endsWith('.txt')) {
        res.setHeader('content-type', 'text/plain');
      }
      fs.createReadStream(fname).pipe(res);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
}
