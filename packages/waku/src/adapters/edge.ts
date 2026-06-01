import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono/tiny';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/adapter-builders';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/internals';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

const DEFAULT_BODY_LIMIT_MAX_SIZE = 100 * 1024 * 1024;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, notFoundHtml },
    options?: {
      bodyLimit?: Parameters<typeof bodyLimit>[0] | false;
      middlewareFns?: ((opts: { app: Hono }) => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
    },
  ) => {
    const {
      bodyLimit: bodyLimitOptions,
      middlewareFns = [],
      middlewareModules = {},
    } = options || {};
    const app = new Hono();
    app.notFound((c) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    if (bodyLimitOptions !== false) {
      app.use(
        bodyLimit(bodyLimitOptions ?? { maxSize: DEFAULT_BODY_LIMIT_MAX_SIZE }),
      );
    }
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn({ app }));
    }
    app.use(middlewareRunner(middlewareModules as never, { app }));
    app.use(rscMiddleware({ processRequest }));
    return {
      fetch: app.fetch,
      build: processBuild,
    };
  },
);
