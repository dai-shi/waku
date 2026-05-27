import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono/tiny';
import {
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_startPreviewServer as startPreviewServer,
} from 'waku/adapter-builders';
import {
  unstable_constants as constants,
  unstable_consumeMultiplexedStream as consumeMultiplexedStream,
  unstable_honoMiddleware as honoMiddleware,
  unstable_produceMultiplexedStream as produceMultiplexedStream,
} from 'waku/internals';
import type { BuildOptions } from './cloudflare-build-enhancer.js';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

const DEFAULT_BODY_LIMIT_MAX_SIZE = 100 * 1024 * 1024;

const DO_NOT_BUNDLE = '';

const PRUNABLE_KEY_PREFIX = '\0__prunable__/';

const emptyStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

function isProductionWorker(req: Request): boolean {
  // This header seems to only be set for production cloudflare workers
  return !!req.headers.get('cf-visitor');
}

function removeGzipEncoding(res: Response): Response {
  const contentType = res.headers.get('content-type');
  if (
    !contentType ||
    contentType.includes('text/html') ||
    contentType.includes('text/plain')
  ) {
    const headers = new Headers(res.headers);
    headers.set('content-encoding', 'Identity');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
  return res;
}

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, setAllEnv, config, notFoundHtml },
    options?: {
      static?: boolean;
      handlers?: Record<string, unknown>;
      assetsDir?: string;
      bodyLimit?: Parameters<typeof bodyLimit>[0] | false;
      middlewareFns?: (() => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
      internalPathToBuildStaticFiles?: string;
    },
  ) => {
    const {
      bodyLimit: bodyLimitOptions,
      middlewareFns = [],
      middlewareModules = {},
      internalPathToBuildStaticFiles = '__waku_internal_build_static_files',
    } = options || {};
    const app = new Hono();
    app.notFound((c) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    app.use(contextMiddleware());
    if (bodyLimitOptions !== false) {
      app.use(
        bodyLimit(bodyLimitOptions ?? { maxSize: DEFAULT_BODY_LIMIT_MAX_SIZE }),
      );
    }
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const buildOptions: BuildOptions = {
      srcDir: config.srcDir,
      distDir: config.distDir,
      DIST_PUBLIC,
      serverless: !options?.static,
    };

    const buildBody = () =>
      produceMultiplexedStream(async (emitFile) => {
        await processBuild({
          emitFile,
          unstable_registerPrunableFile: (srcPath) =>
            emitFile(PRUNABLE_KEY_PREFIX + srcPath, emptyStream()),
        });
      });

    const fetchFn = async (req: Request) => {
      if (
        new URL(req.url).pathname === `/${internalPathToBuildStaticFiles}` &&
        !isProductionWorker(req)
      ) {
        return new Response(buildBody());
      }
      let cloudflareContext;
      try {
        cloudflareContext = await import(
          /* @vite-ignore */ DO_NOT_BUNDLE + 'cloudflare:workers'
        );
      } catch {
        // Not in a Cloudflare environment
      }
      let res: Response | Promise<Response>;
      if (cloudflareContext) {
        const { env, waitUntil, passThroughOnException } = cloudflareContext;
        res = app.fetch(req, env, {
          waitUntil,
          passThroughOnException,
          props: undefined,
        });
      } else {
        res = app.fetch(req);
      }
      // Workaround https://github.com/cloudflare/workers-sdk/issues/6577
      if (import.meta.env?.PROD && !isProductionWorker(req)) {
        if ('then' in res) {
          res = res.then((res) => removeGzipEncoding(res));
        } else {
          res = removeGzipEncoding(res);
        }
      }
      return res;
    };

    return {
      fetch: fetchFn,
      build: async (utils) => {
        const server = await startPreviewServer();
        // Fallback middleware for the case without @cloudflare/vite-plugin
        server.middlewares.use(async (_req, res, next) => {
          try {
            const { Readable } = await import(
              /* @vite-ignore */ DO_NOT_BUNDLE + 'node:stream'
            );
            Readable.fromWeb(buildBody() as never).pipe(res);
          } catch (err) {
            next(err);
          }
        });
        const response = await fetch(
          server.baseUrl + internalPathToBuildStaticFiles,
          { headers: { connection: 'close' } },
        );
        await consumeMultiplexedStream(response.body!, async (key, stream) => {
          if (key.startsWith(PRUNABLE_KEY_PREFIX)) {
            utils.unstable_registerPrunableFile(
              key.slice(PRUNABLE_KEY_PREFIX.length),
            );
            return;
          }
          await utils.emitFile(key, stream);
        });
        // https://github.com/nodejs/node/issues/56645
        await new Promise((resolve) => setTimeout(resolve, 100));
        await server.close();
      },
      buildOptions,
      buildEnhancers: ['waku/adapters/cloudflare-build-enhancer'],
      defaultExport: {
        ...options?.handlers,
        fetch(req: Request, env: Record<string, string>) {
          setAllEnv(env);
          return fetchFn(req);
        },
      },
    };
  },
);
