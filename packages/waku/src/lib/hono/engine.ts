import type { MiddlewareHandler } from 'hono';

import { resolveConfigDev } from '../config.js';
import type {
  HandlerContext,
  Middleware,
  MiddlewareOptions,
} from '../middleware/types.js';

// Internal context key
const HONO_CONTEXT = '__hono_context';

// serverEngine returns hono middleware that runs Waku middleware.
export const serverEngine = (options: MiddlewareOptions): MiddlewareHandler => {
  const middlewarePromise: Promise<{ default: Middleware }[]> =
    options.cmd === 'start'
      ? options.loadEntries().then((entries) => entries.loadMiddleware())
      : resolveConfigDev(options.config).then((config) =>
          Promise.all(
            config.middleware.map(
              // TODO use load module instead of import
              (name) => import(name) as Promise<{ default: Middleware }>,
            ),
          ),
        );
  const handlersPromise = middlewarePromise.then((middlewareList) =>
    middlewareList.map((middleware) => middleware.default(options)),
  );
  return async (c, next) => {
    const ctx: HandlerContext = {
      req: {
        body: c.req.raw.body,
        url: new URL(c.req.url),
        method: c.req.method,
        headers: c.req.header(),
      },
      res: {},
      context: {
        [HONO_CONTEXT]: c,
      },
      data: {
        [HONO_CONTEXT]: c,
      },
    };
    const handlers = await handlersPromise;
    const run = async (index: number) => {
      if (index >= handlers.length) {
        return;
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
    if (ctx.res.body || ctx.res.status) {
      const status = ctx.res.status || 200;
      const headers = ctx.res.headers || {};
      if (ctx.res.body) {
        return c.body(ctx.res.body, status as never, headers);
      }
      return c.body(null, status as never, headers);
    }
    await next();
  };
};
