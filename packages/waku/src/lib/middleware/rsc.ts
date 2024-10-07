import { resolveConfig } from '../config.js';
import { decodeRscPath, hasStatusCode } from '../renderers/utils.js';
import { renderRsc } from '../renderers/rsc-renderer.js';
import type { RenderRscArgs } from '../renderers/rsc-renderer.js';
import type { Middleware } from './types.js';
import { stringToStream } from '../utils/stream.js';

export const rsc: Middleware = (options) => {
  const env = options.env || {};
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
    const [{ middleware: _removed, ...config }, entries] = await Promise.all([
      configPromise,
      entriesPromise,
    ]);
    const basePrefix = config.basePath + config.rscBase + '/';
    if (ctx.req.url.pathname.startsWith(basePrefix)) {
      const { headers } = ctx.req;
      try {
        const rscPath = decodeRscPath(
          decodeURI(ctx.req.url.pathname.slice(basePrefix.length)),
        );
        const args: RenderRscArgs = {
          env,
          config,
          rscPath,
          context: ctx.context,
          decodedBody: ctx.req.url.searchParams,
          body: ctx.req.body,
          contentType: headers['content-type'] || '',
        };
        const { unstable_devServer: devServer } = ctx;
        const readable = await (devServer
          ? renderRsc(args, {
              isDev: true,
              loadServerModuleRsc: devServer.loadServerModuleRsc,
              resolveClientEntry: devServer.resolveClientEntry,
              entries: await devServer.loadEntriesDev(config),
            })
          : renderRsc(args, { isDev: false, entries }));
        ctx.res.body = readable;
        return;
      } catch (err) {
        ctx.res.body = stringToStream(`${err}`);
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
