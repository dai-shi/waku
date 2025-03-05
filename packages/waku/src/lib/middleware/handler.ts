import type { ReactNode } from 'react';

import { resolveConfigDev } from '../config.js';
import type { ConfigPrd } from '../config.js';
import {
  INTERNAL_setAllEnv,
  INTERNAL_setPlatformDataLoader,
} from '../../server.js';
import type { HandleRequest, HandlerRes } from '../types.js';
import type { Middleware, HandlerContext } from './types.js';
import { renderRsc, decodeBody, decodePostAction } from '../renderers/rsc.js';
import { renderHtml } from '../renderers/html.js';
import { decodeRscPath, decodeFuncId } from '../renderers/utils.js';
import { filePathToFileURL, getPathMapping } from '../utils/path.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { stringToStream } from '../utils/stream.js';

export const SERVER_MODULE_MAP = {
  'rsdw-server': 'react-server-dom-webpack/server.edge',
} as const;
export const CLIENT_MODULE_MAP = {
  'rd-server': 'react-dom/server.edge',
  'rsdw-client': 'react-server-dom-webpack/client.edge',
  'waku-minimal-client': 'waku/minimal/client',
} as const;
export const CLIENT_PREFIX = 'client/';

const getInput = async (
  config: ConfigPrd,
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
  if (ctx.req.method === 'POST') {
    const postAction = await decodePostAction(ctx);
    if (postAction) {
      return {
        type: 'action',
        fn: postAction,
        pathname: '/' + ctx.req.url.pathname.slice(config.basePath.length),
        req: ctx.req,
      };
    }
  }
  return {
    type: 'custom',
    pathname: '/' + ctx.req.url.pathname.slice(config.basePath.length),
    req: ctx.req,
  };
};

export const handler: Middleware = (options) => {
  const env = options.env;
  INTERNAL_setAllEnv(env);
  const entriesPrdPromise =
    options.cmd === 'start' ? options.loadEntries() : null;
  entriesPrdPromise
    ?.then((entries) => {
      if (entries.loadPlatformData) {
        INTERNAL_setPlatformDataLoader(entries.loadPlatformData);
      }
    })
    .catch(() => {});
  const configDevPromise =
    options.cmd === 'dev' ? resolveConfigDev(options.config) : null;

  return async (ctx, next) => {
    const { unstable_devServer: devServer } = ctx;
    const entriesPrd = await entriesPrdPromise!;
    const config = devServer ? await configDevPromise! : entriesPrd.configPrd;
    const entries = devServer
      ? await devServer.loadEntriesDev(await configDevPromise!)
      : entriesPrd;
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
        renderRsc(config, ctx, elements, options.unstable_onError),
      renderHtml: async (
        elements: Record<string, unknown>,
        html: ReactNode,
        opts: { rscPath: string; actionResult?: unknown },
      ) => {
        const readable = await renderHtml(
          config,
          ctx,
          htmlHead,
          elements,
          options.unstable_onError,
          html,
          opts.rscPath,
          opts.actionResult,
        );
        const headers = { 'content-type': 'text/html; charset=utf-8' };
        let body = readable;
        if (transformIndexHtml) {
          body = readable.pipeThrough(transformIndexHtml) as never;
          body.allReady = readable.allReady;
        }
        return { body, headers };
      },
    };
    const input = await getInput(config, ctx, loadServerModule);
    if (input) {
      let res: ReadableStream | HandlerRes | null | undefined;
      try {
        res = await entries.default.handleRequest(input, utils);
      } catch (e) {
        options.unstable_onError.forEach((fn) => fn(e, ctx, 'handler'));
        const info = getErrorInfo(e);
        if (info?.status !== 404) {
          ctx.res.status = info?.status || 500;
          ctx.res.body = stringToStream(
            (e as { message?: string } | undefined)?.message || String(e),
          );
          if (info?.location) {
            (ctx.res.headers ||= {}).location = info.location;
          }
        }
      }
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

    await next();
  };
};
