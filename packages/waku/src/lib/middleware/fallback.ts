import { resolveConfigDev } from '../config.js';
import { stringToStream } from '../utils/stream.js';
import type { Middleware } from './types.js';

export const fallback: Middleware = (options) => {
  if (options.cmd === 'dev') {
    const configPromise = resolveConfigDev(options.config);
    return async (ctx, next) => {
      if (!ctx.res.body) {
        const config = await configPromise;
        const newUrl = new URL(config.basePath, ctx.req.url);
        ctx.req.url.pathname = newUrl.pathname;
      }
      return next();
    };
  }

  const entriesPromise = options.loadEntries();
  return async (ctx, _next) => {
    const entries = await entriesPromise;
    ctx.res.body = stringToStream(entries.publicIndexHtml);
    ctx.res.headers = {
      ...ctx.res.headers,
      'content-type': 'text/html; charset=utf-8',
    };
  };
};
