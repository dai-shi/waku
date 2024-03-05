import { resolveConfig } from '../config.js';
import { getPathMapping } from '../utils/path.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { hasStatusCode, encodeInput } from '../renderers/utils.js';
import { getSsrConfig } from '../renderers/rsc-renderer.js';
import type { Middleware } from './types.js';

export const ssr: Middleware = (options) => {
  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
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

  return async (ctx, next) => {
    const { devServer } = ctx;
    if (
      devServer &&
      (await devServer.willBeHandledLater(ctx.req.url.pathname))
    ) {
      await next();
      return;
    }
    const [{ middleware: _removed, ...config }, entries] = await Promise.all([
      configPromise,
      entriesPromise,
    ]);
    try {
      const htmlHead = devServer
        ? config.htmlHead
        : entries.dynamicHtmlPaths.find(([pathSpec]) =>
            getPathMapping(pathSpec, ctx.req.url.pathname),
          )?.[1];
      if (htmlHead) {
        const readable = await renderHtml({
          config,
          pathname: ctx.req.url.pathname,
          searchParams: ctx.req.url.searchParams,
          htmlHead,
          renderRscForHtml: async (input, searchParams) => {
            ctx.req.url.pathname =
              config.basePath + config.rscPath + '/' + encodeInput(input);
            ctx.req.url.search = searchParams.toString();
            await next();
            if (!ctx.res.body) {
              throw new Error('No body');
            }
            return ctx.res.body;
          },
          ...(devServer
            ? {
                isDev: true,
                getSsrConfigForHtml: (pathname, searchParams) =>
                  devServer.getSsrConfigWithWorker({
                    config,
                    pathname,
                    searchParams,
                  }),
                rootDir: devServer.rootDir,
                loadServerFile: devServer.loadServerFile,
              }
            : {
                isDev: false,
                getSsrConfigForHtml: (pathname, searchParams) =>
                  getSsrConfig(
                    { config, pathname, searchParams },
                    { isDev: false, entries },
                  ),
                loadModule: entries.loadModule,
              }),
        });
        if (readable) {
          ctx.res.headers = {
            ...ctx.res.headers,
            'content-type': 'text/html; charset=utf-8',
          };
          ctx.res.body = devServer
            ? readable.pipeThrough(
                await devServer.transformIndexHtml(ctx.req.url.pathname),
              )
            : readable;
          return;
        }
      }
    } catch (err) {
      if (hasStatusCode(err)) {
        ctx.res.status = err.statusCode;
      } else {
        console.info('Cannot process SSR', err);
        ctx.res.status = 500;
      }
      return;
    }
    await next();
  };
};
