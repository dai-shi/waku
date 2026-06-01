import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
// FIXME hopefully we should avoid bundling this
import { Hono as HonoForDevAndBuild } from 'hono/tiny';
import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/adapter-builders';
import {
  unstable_constants as constants,
  unstable_honoMiddleware as honoMiddleware,
  unstable_runWithContext as runWithContext,
} from 'waku/internals';
import type { BuildOptions } from './deno-build-enhancer.js';

const { DIST_PUBLIC } = constants;
const { rscMiddleware, middlewareRunner } = honoMiddleware;

function contextMiddleware(): MiddlewareHandler {
  return (c, next) => {
    const req = c.req.raw;
    return runWithContext(req, next);
  };
}

const DEFAULT_BODY_LIMIT_MAX_SIZE = 100 * 1024 * 1024;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config, notFoundHtml },
    options?: {
      bodyLimit?: Parameters<typeof bodyLimit>[0] | false;
      middlewareFns?: ((opts: {
        app: HonoForDevAndBuild;
      }) => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
    },
  ) => {
    const {
      bodyLimit: bodyLimitOptions,
      middlewareFns = [],
      middlewareModules = {},
    } = options || {};
    const {
      __WAKU_DENO_ADAPTER_HONO__: Hono = HonoForDevAndBuild,
      __WAKU_DENO_ADAPTER_SERVE_STATIC__: serveStatic,
    } = globalThis as any;
    const app = new Hono();
    app.notFound((c: any) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    if (serveStatic) {
      app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
    }
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
    const buildOptions: BuildOptions = {
      distDir: config.distDir,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      buildOptions,
      buildEnhancers: ['waku/adapters/deno-build-enhancer'],
    };
  },
);
