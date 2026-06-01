import type { MiddlewareHandler } from 'hono';
import type { Hono } from 'hono/tiny';
import type { Unstable_ProcessRequest as ProcessRequest } from '../types.js';

export function rscMiddleware({
  processRequest,
}: {
  processRequest: ProcessRequest;
}): MiddlewareHandler {
  return async (c, next) => {
    const req = c.req.raw;
    const res = await processRequest(req);
    if (res) {
      c.res = res;
      return;
    }
    await next();
  };
}

export function middlewareRunner(
  middlewareModules: Record<
    string,
    () => Promise<{
      default: (opts: { app: Hono }) => MiddlewareHandler;
    }>
  >,
  opts: { app: Hono },
): MiddlewareHandler {
  let handlersPromise: Promise<MiddlewareHandler[]> | undefined;
  return async (c, next) => {
    if (!handlersPromise) {
      handlersPromise = Promise.all(
        Object.values(middlewareModules).map((m) =>
          m().then((mod) => mod.default(opts)),
        ),
      );
    }
    const handlers = await handlersPromise;
    let response: Response | undefined;
    const run = async (index: number) => {
      const handler = handlers[index];
      if (handler) {
        const result = await handler(c, () => run(index + 1));
        if (result && !response) {
          response = result;
        }
      } else {
        await next();
      }
    };
    await run(0);
    return response;
  };
}
