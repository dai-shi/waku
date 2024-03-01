import { resolveConfig } from '../config.js';
import { getPathMapping } from '../utils/path.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { hasStatusCode, encodeInput } from '../renderers/utils.js';
import { getSsrConfig } from '../renderers/rsc-renderer.js';
import type { Middleware } from './types.js';

export const CLIENT_PREFIX = 'client/';

export const ssr: Middleware = (options) => {
  if (options.cmd === 'dev') {
    throw new Error('not implemented yet');
  }

  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const configPromise = resolveConfig(options.config || {});
  const entriesPromise = options.loadEntries();

  return async (ctx, next) => {
    const [config, entries] = await Promise.all([
      configPromise,
      entriesPromise,
    ]);
    try {
      const { dynamicHtmlPaths } = entries;
      const htmlHead = dynamicHtmlPaths.find(([pathSpec]) =>
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
            ctx.req.url.search = '?' + searchParams.toString();
            await next();
            if (!ctx.res.body) {
              throw new Error('No body');
            }
            return ctx.res.body;
          },
          getSsrConfigForHtml: (pathname, searchParams) =>
            getSsrConfig(
              {
                config,
                pathname,
                searchParams,
              },
              {
                isDev: false,
                entries,
              },
            ),
          loadClientModule: (key) => entries.loadModule(CLIENT_PREFIX + key),
          isDev: false,
          loadModule: entries.loadModule,
        });
        if (readable) {
          ctx.res.headers = {
            ...ctx.res.headers,
            'content-type': 'text/html; charset=utf-8',
          };
          ctx.res.body = readable;
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
