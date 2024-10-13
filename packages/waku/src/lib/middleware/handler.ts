import type { ReactNode } from 'react';

import { resolveConfig } from '../config.js';
import { setAllEnvInternal } from '../../server.js';
import type { Middleware } from './types.js';
import type { new_defineEntries } from '../../minimal/server.js';
import { renderRsc } from '../renderers/rsc.js';
import { renderHtml } from '../renderers/html.js';
import { decodeRscPath } from '../renderers/utils.js';
import { getPathMapping } from '../utils/path.js';

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
    const htmlHead = devServer
      ? ''
      : entriesPrd.dynamicHtmlPaths.find(([pathSpec]) =>
          getPathMapping(pathSpec, ctx.req.url.pathname),
        )?.[1] || '';
    const transformIndexHtml =
      devServer && (await devServer.transformIndexHtml(ctx.req.url.pathname));
    const utils = {
      renderRsc: (elements: Record<string, ReactNode>) =>
        renderRsc(config, ctx, elements),
      decodeRscPath,
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
      const res = await (
        entries.default.unstable_handleRequest as HandleRequest
      )(config, ctx.req, utils);
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
