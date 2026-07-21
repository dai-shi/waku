import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import wakuConfig from '../../waku.config.js';

const { rscBase } = wakuConfig;

export const authStorage = new AsyncLocalStorage<{ unauthorized?: boolean }>();

const validateMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const url = new URL(c.req.raw.url);
    if (url.pathname === '/invalid') {
      c.res = new Response('Unauthorized', { status: 401 });
      return;
    }
    const store = {
      unauthorized:
        url.pathname.startsWith(`/${rscBase}/R/invalid`) ||
        url.searchParams.get('query') === 'fail=1',
    };
    await authStorage.run(store, next);
  };
};

export default validateMiddleware;
