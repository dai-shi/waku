import type { MiddlewareHandler } from 'hono';

import { resolveConfig } from '../config.js';
import type { HandlerContext, MiddlewareOptions } from '../middleware/types.js';
import { filePathToFileURL } from 'waku/lib/utils/path';

const createEmptyReadableStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

export const runner = (options: MiddlewareOptions): MiddlewareHandler => {
  const entriesPromise =
    options.cmd === 'start'
      ? options.loadEntries()
      : ('Error: loadEntries are not available' as never);
  const configPromise =
    options.cmd === 'start'
      ? entriesPromise.then((entries) =>
          entries.loadConfig().then((config) => resolveConfig(config)),
        )
      : resolveConfig(options.config);
  const handlersPromise = configPromise.then((config) =>
    Promise.all(
      config
        .middleware(options.cmd)
        .map(async (middleware) => (await middleware).default(options)),
    ),
  );

  (globalThis as any).__WAKU_HACK_IMPORT__ = async (id: string) => {
    if (!id.startsWith('@id/')) {
      throw new Error('Unexpected server entry in PRD');
    }
    const { loadModule } = await entriesPromise;
    return loadModule(id.slice('@id/'.length));
  };

  return async (c, next) => {
    const ctx: HandlerContext = {
      req: {
        body: c.req.raw.body || createEmptyReadableStream(),
        url: new URL(c.req.url),
        method: c.req.method,
        headers: c.req.header(),
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
