import type { ReactNode } from 'react';

import { resolveConfig } from '../config.js';
import type { PureConfig } from '../config.js';
import { setAllEnvInternal } from '../../server.js';
import type { Middleware, HandlerContext } from './types.js';
import type { new_defineEntries } from '../../minimal/server.js';
import { renderRsc, decodeBody } from '../renderers/rsc.js';
import { renderHtml } from '../renderers/html.js';
import { decodeRscPath, decodeFuncId } from '../renderers/utils.js';
import { filePathToFileURL, getPathMapping } from '../utils/path.js';

type HandleRequest = Parameters<
  typeof new_defineEntries
>[0]['unstable_handleRequest'];

// TODO avoid copy-pasting
const SERVER_MODULE_MAP = {
  'rsdw-server': 'react-server-dom-webpack/server.edge',
} as const;
const CLIENT_MODULE_MAP = {
  'rd-server': 'react-dom/server.edge',
  'rsdw-client': 'react-server-dom-webpack/client.edge',
  'waku-minimal-client': 'waku/minimal/client',
} as const;
const CLIENT_PREFIX = 'client/';

const getInput = async (
  config: PureConfig,
  ctx: HandlerContext,
  loadServerModule: (fileId: string) => Promise<unknown>,
): Promise<Parameters<HandleRequest>[0] | null> => {
  if (!ctx.req.url.pathname.startsWith(config.basePath)) {
    return null;
  }
  const basePrefix = config.basePath + config.rscBase + '/';
  if (ctx.req.url.pathname.startsWith(basePrefix)) {
    const rscPath = decodeRscPath(
      decodeURI(ctx.req.url.pathname.slice(basePrefix.length)),
    );
    const decodedBody = await decodeBody(ctx);
    const funcId = decodeFuncId(rscPath);
    if (funcId) {
      const args = Array.isArray(decodedBody)
        ? decodedBody
        : decodedBody instanceof URLSearchParams
          ? [decodedBody]
          : [];
      const [fileId, name] = funcId.split('#') as [string, string];
      const mod: any = await loadServerModule(fileId);
      return { type: 'function', fn: mod[name], args, req: ctx.req };
    }
    return { type: 'component', rscPath, rscParams: decodedBody, req: ctx.req };
  }
  return {
    type: 'custom',
    pathname: '/' + ctx.req.url.pathname.slice(config.basePath.length),
    req: ctx.req,
  };
};

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
    const rdServer = devServer
      ? await devServer.loadServerModuleMain(CLIENT_MODULE_MAP['rd-server'])
      : await entriesPrd.loadModule(CLIENT_PREFIX + 'rd-server');
    const rsdwClient = devServer
      ? await devServer.loadServerModuleMain(CLIENT_MODULE_MAP['rsdw-client'])
      : await entriesPrd.loadModule(CLIENT_PREFIX + 'rsdw-client');
    const wakuMinimalClient = devServer
      ? await devServer.loadServerModuleMain(
          CLIENT_MODULE_MAP['waku-minimal-client'],
        )
      : await entriesPrd.loadModule(CLIENT_PREFIX + 'waku-minimal-client');
    ctx.unstable_modules = {
      rsdwServer,
      rdServer,
      rsdwClient,
      wakuMinimalClient,
    };
    const loadServerModule = (fileId: string) => {
      if (devServer) {
        return devServer.loadServerModuleRsc(filePathToFileURL(fileId));
      } else {
        return entriesPrd.loadModule(fileId + '.js');
      }
    };
    const htmlHead =
      (!devServer &&
        entriesPrd.dynamicHtmlPaths.find(([pathSpec]) =>
          getPathMapping(pathSpec, ctx.req.url.pathname),
        )?.[1]) ||
      '';
    const transformIndexHtml =
      devServer && (await devServer.transformIndexHtml(ctx.req.url.pathname));
    const utils = {
      renderRsc: (elements: Record<string, unknown>) =>
        renderRsc(config, ctx, elements),
      renderHtml: (
        elements: Record<string, ReactNode>,
        html: ReactNode,
        rscPath: string,
      ) => {
        const readable = renderHtml(
          config,
          ctx,
          htmlHead,
          elements,
          html,
          rscPath,
        );
        const headers = { 'content-type': 'text/html; charset=utf-8' };
        return {
          body: transformIndexHtml
            ? readable.pipeThrough(transformIndexHtml)
            : readable,
          headers,
        };
      },
    };
    if ('unstable_handleRequest' in entries.default) {
      const input = await getInput(config, ctx, loadServerModule);
      if (input) {
        const res = await (
          entries.default.unstable_handleRequest as HandleRequest
        )(input, utils);
        if (res instanceof ReadableStream) {
          ctx.res.body = res;
        } else if (res) {
          if (res.body) {
            ctx.res.body = res.body;
          }
          if (res.status) {
            ctx.res.status = res.status;
          }
          if (res.headers) {
            Object.assign((ctx.res.headers ||= {}), res.headers);
          }
        }
        if (ctx.res.body || ctx.res.status) {
          return;
        }
      }
    }
    await next();
  };
};
