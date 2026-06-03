import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono/tiny';
import { unstable_createServerEntryAdapter as createServerEntryAdapter } from 'waku/adapter-builders';
import {
  unstable_constants as constants,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';
import type { BuildOptions } from './node-build-enhancer.js';

const { DIST_PUBLIC } = constants;
const { rscMiddleware, middlewareRunner } = honoMiddleware;

const DEFAULT_BODY_LIMIT_MAX_SIZE = 100 * 1024 * 1024;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config, isBuild, notFoundHtml },
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
    if (isBuild) {
      app.use(
        `${config.basePath}*`,
        serveStatic({
          root: path.join(config.distDir, DIST_PUBLIC),
          rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
        }),
      );
    }
    if (bodyLimitOptions !== false) {
      app.use(
        bodyLimit(bodyLimitOptions ?? { maxSize: DEFAULT_BODY_LIMIT_MAX_SIZE }),
      );
    }
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
      buildEnhancers: ['waku/adapters/node-build-enhancer'],
      serve,
    };
  },
);
