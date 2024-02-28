import { resolveConfig } from '../config.js';
import { decodeInput, hasStatusCode } from '../renderers/utils.js';
import { renderRsc } from '../renderers/rsc-renderer.js';
import type { Middleware } from './types.js';

export const rsc: Middleware = (options) => {
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
    const basePrefix = config.basePath + config.rscPath + '/';
    if (ctx.req.url.pathname.startsWith(basePrefix)) {
      const { method, headers } = ctx.req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const input = decodeInput(
          ctx.req.url.pathname.slice(basePrefix.length),
        );
        const readable = await renderRsc({
          config,
          input,
          searchParams: ctx.req.url.searchParams,
          method,
          context: ctx.context,
          body: ctx.req.body,
          contentType: headers['content-type'] || '',
          isDev: false,
          entries,
        });
        ctx.res.body = readable;
        return;
      } catch (err) {
        if (hasStatusCode(err)) {
          ctx.res.status = err.statusCode;
        } else {
          console.info('Cannot process RSC', err);
          ctx.res.status = 500;
        }
        return;
      }
    }
    await next();
  };
};
