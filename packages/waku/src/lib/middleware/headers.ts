import type { Middleware } from './types.js';

export const REQUEST_HEADERS = '__waku_requestHeaders';

export const headers: Middleware = () => {
  return async (ctx, next) => {
    ctx.context[REQUEST_HEADERS] = ctx.req.headers;
    await next();
  };
};
