import { stringToStream } from '../utils/stream.js';
import type { Middleware } from './types.js';

export const fallback: Middleware = (options) => {
  if (options.cmd === 'dev') {
    // pass through in dev command
    return (_ctx, next) => next();
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
