import { resolveConfig } from '../config.js';
import type { PureConfig } from '../config.js';
import { setAllEnvInternal } from '../../server.js';
import type { Middleware, HandlerContext } from './types.js';

// TODO avoid copy-pasting
type HandleRequest = (config: PureConfig, ctx: HandlerContext) => Promise<void>;

// TODO avoid copy-pasting
const SERVER_MODULE_MAP = {
  'rsdw-server': 'react-server-dom-webpack/server.edge',
} as const;

export const handler: Middleware = (options) => {
  const env = options.env || {};
  setAllEnvInternal(env);
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
    const { unstable_devServer: devServer } = ctx;
    const [
      { middleware: _removed1, unstable_honoEnhancer: _removed2, ...config },
      entriesPrd,
    ] = await Promise.all([configPromise, entriesPromise]);
    const entriesDev = devServer && (await devServer.loadEntriesDev(config));
    const entries: { default: object } = devServer ? entriesDev! : entriesPrd;
    const rsdwServer = devServer
      ? await devServer.loadServerModuleRsc(SERVER_MODULE_MAP['rsdw-server'])
      : await entriesPrd.loadModule('rsdw-server');
    ctx.unstable_modules = { rsdwServer };
    if ('unstable_handleRequest' in entries.default) {
      await (entries.default.unstable_handleRequest as HandleRequest)(
        config,
        ctx,
      );
      if (ctx.res.body || ctx.res.status) {
        return;
      }
    }
    await next();
  };
};
