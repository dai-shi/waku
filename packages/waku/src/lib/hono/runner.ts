import type { MiddlewareHandler } from 'hono';

import type { HandlerContext, MiddlewareOptions } from '../middleware/types.js';

const createEmptyReadableStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

export const runner = (options: MiddlewareOptions): MiddlewareHandler => {
  const middlewareList = [
    import('waku/middleware').then((mod) => mod.ssr),
    import('waku/middleware').then((mod) => mod.rsc),
    // import('waku/middleware').then((mod) => mod.fallback),
  ];
  const handlersPromise = Promise.all(
    middlewareList.map(async (middleware) => (await middleware)(options)),
  );
  return async (c, next) => {
    const ctx: HandlerContext = {
      req: {
        body: c.req.raw.body || createEmptyReadableStream(),
        url: new URL(c.req.url),
        method: c.req.method,
        headers: Object.fromEntries(
          Array.from(c.req.raw.headers.entries()).map(([k, v]) => [k, v]),
        ),
      },
      res: {},
      context: {},
    };
    const handlers = await handlersPromise;
    const run = async (index: number) => {
      if (index >= handlers.length) {
        return next();
      }
      let alreadyCalled = false;
      await handlers[index]!(ctx, async () => {
        if (!alreadyCalled) {
          alreadyCalled = true;
          await run(index + 1);
        }
      });
    };
    await run(0);
    if ('status' in ctx.res) {
      c.status(ctx.res.status as any);
    }
    if ('headers' in ctx.res) {
      for (const [k, v] of Object.entries(ctx.res.headers)) {
        c.header(k, v);
      }
    }
    if ('body' in ctx.res) {
      return c.body(ctx.res.body);
    }
    return c.body(null);
  };
};
