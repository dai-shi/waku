// This file can depend on Node.js

import { pathToFileURL } from 'node:url';
import { parentPort, getEnvironmentData } from 'node:worker_threads';
import { Server } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransferListItem } from 'node:worker_threads';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import type { EntriesDev } from '../../server.js';
import {
  joinPath,
  fileURLToFilePath,
  encodeFilePathToAbsolute,
} from '../utils/path.js';
import { deepFreeze, hasStatusCode } from './utils.js';
import type { MessageReq, MessageRes } from './dev-worker-api.js';
import { renderRsc, getSsrConfig } from './rsc-renderer.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import { rscManagedPlugin } from '../plugins/vite-plugin-rsc-managed.js';
import { rscDelegatePlugin } from '../plugins/vite-plugin-rsc-delegate.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';
import { viteHot } from '../plugins/vite-plugin-rsc-hmr.js';

// For react-server-dom-webpack/server.edge
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

const { default: module } = await import('node:module');
const HAS_MODULE_REGISTER = typeof module.register === 'function';
if (HAS_MODULE_REGISTER) {
  module.register('waku/node-loader', pathToFileURL('./'));
}

(globalThis as any).__WAKU_PRIVATE_ENV__ = getEnvironmentData(
  '__WAKU_PRIVATE_ENV__',
);
const configSrcDir = getEnvironmentData('CONFIG_SRC_DIR') as string;
const configEntriesJs = getEnvironmentData('CONFIG_ENTRIES_JS') as string;
const configPrivateDir = getEnvironmentData('CONFIG_PRIVATE_DIR') as string;

const resolveClientEntryForDev = (id: string, config: { basePath: string }) => {
  const filePath = id.startsWith('file://') ? fileURLToFilePath(id) : id;
  // HACK this relies on Vite's internal implementation detail.
  return config.basePath + '@fs' + encodeFilePathToAbsolute(filePath);
};

const handleRender = async (mesg: MessageReq & { type: 'render' }) => {
  const { id, type: _removed, hasModuleIdCallback, ...rest } = mesg;
  try {
    let moduleIdCallback: ((id: string) => void) | undefined;
    if (hasModuleIdCallback) {
      moduleIdCallback = (moduleId: string) => {
        const mesg: MessageRes = { id, type: 'moduleId', moduleId };
        parentPort!.postMessage(mesg);
      };
    }
    const readable = await renderRsc(
      {
        config: rest.config,
        input: rest.input,
        searchParams: new URLSearchParams(rest.searchParamsString),
        method: rest.method,
        context: rest.context,
        body: rest.body,
        contentType: rest.contentType,
        moduleIdCallback,
      },
      {
        isDev: true,
        loadServerFile,
        loadServerModule,
        resolveClientEntry: (id: string) =>
          resolveClientEntryForDev(id, rest.config),
        entries: await loadEntries(rest.config),
      },
    );
    const mesg: MessageRes = {
      id,
      type: 'start',
      context: rest.context,
      stream: readable,
    };
    parentPort!.postMessage(mesg, [readable as unknown as TransferListItem]);
    deepFreeze(rest.context);
  } catch (err) {
    const mesg: MessageRes = { id, type: 'err', err: `${err}` };
    if (hasStatusCode(err)) {
      mesg.statusCode = err.statusCode;
    }
    parentPort!.postMessage(mesg);
  }
};

const handleGetSsrConfig = async (
  mesg: MessageReq & { type: 'getSsrConfig' },
) => {
  const { id, config, pathname, searchParamsString } = mesg;
  const searchParams = new URLSearchParams(searchParamsString);
  try {
    const ssrConfig = await getSsrConfig(
      {
        config,
        pathname,
        searchParams,
      },
      {
        isDev: true,
        resolveClientEntry: (id: string) =>
          resolveClientEntryForDev(id, config),
        entries: await loadEntries(config),
      },
    );
    const mesg: MessageRes = ssrConfig
      ? { id, type: 'ssrConfig', ...ssrConfig }
      : { id, type: 'noSsrConfig' };
    parentPort!.postMessage(
      mesg,
      ssrConfig ? [ssrConfig.body as unknown as TransferListItem] : undefined,
    );
  } catch (err) {
    const mesg: MessageRes = { id, type: 'err', err: `${err}` };
    if (hasStatusCode(err)) {
      mesg.statusCode = err.statusCode;
    }
    parentPort!.postMessage(mesg);
  }
};

const dummyServer = new Server(); // FIXME we hope to avoid this hack

const mergedViteConfig = await mergeUserViteConfig({
  plugins: [
    viteReact(),
    rscEnvPlugin({}),
    rscPrivatePlugin({ privateDir: configPrivateDir }),
    rscManagedPlugin({ srcDir: configSrcDir, entriesJs: configEntriesJs }),
    { name: 'rsc-index-plugin' }, // dummy to match with handler-dev.ts
    { name: 'rsc-hmr-plugin', enforce: 'post' }, // dummy to match with handler-dev.ts
    nonjsResolvePlugin(),
    rscTransformPlugin({ isBuild: false }),
    rscDelegatePlugin((payload) => {
      const mesg: MessageRes = { type: 'hot-update', payload };
      parentPort!.postMessage(mesg);
    }),
  ],
  optimizeDeps: {
    include: ['react-server-dom-webpack/client', 'react-dom'],
    exclude: ['waku'],
    entries: [`${configSrcDir}/${configEntriesJs}`.replace(/\.js$/, '.*')],
  },
  ssr: {
    resolve: {
      conditions: ['react-server', 'workerd'],
      externalConditions: ['react-server', 'workerd'],
    },
    external: [
      // FIXME We want to externalize waku, but it fails on windows.
      // 'waku',
      // 'waku/client',
      // 'waku/server',
      // 'waku/router/client',
      // 'waku/router/server',
    ],
    // FIXME We want to externalize waku, but it fails on windows.
    noExternal: ['waku'],
  },
  appType: 'custom',
  server: { middlewareMode: true, hmr: { server: dummyServer } },
});

const vitePromise = createViteServer(mergedViteConfig).then(async (vite) => {
  const hot = viteHot(vite);
  await hot.close();
  return vite;
});

const loadServerFile = async (fileURL: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
};

const loadServerModule = async (id: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(id);
};

const loadEntries = async (config: { srcDir: string; entriesJs: string }) => {
  const vite = await vitePromise;
  const filePath = joinPath(vite.config.root, config.srcDir, config.entriesJs);
  return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
};

// load entries eagerly
loadEntries({ srcDir: configSrcDir, entriesJs: configEntriesJs }).catch(() => {
  // ignore
});

parentPort!.on('message', async (mesg: MessageReq) => {
  if (mesg.type === 'render') {
    await handleRender(mesg);
  } else if (mesg.type === 'getSsrConfig') {
    await handleGetSsrConfig(mesg);
  }
});
