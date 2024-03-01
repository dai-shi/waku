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
    import('waku/middleware/ssr'),
    import('waku/middleware/rsc'),
  ];
  // Without SSR
  // const middlewareList = [
  //   import('waku/middleware/rsc'),
  //   import('waku/middleware/fallback'),
  // ];
  if (options.cmd === 'dev') {
    middlewareList.unshift(
      import('DO_NOT_BUNDLE'.slice(Infinity) + 'waku/middleware/dev-server'),
    );
  }
  const handlersPromise = Promise.all(
    middlewareList.map(async (middleware) =>
      (await middleware).default(options),
    ),
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
    return c.body(
      ctx.res.body || null,
      (ctx.res.status as any) || 200,
      ctx.res.headers || {},
    );
  };
};
