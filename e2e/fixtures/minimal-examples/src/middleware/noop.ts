import type { MiddlewareHandler } from 'hono';

const middleware = (): MiddlewareHandler => async (c, next) => {
  await next();
  c.res.headers.set('x-minimal-middleware', 'enabled');
};

export default middleware;
