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
  decodeFilePathFromAbsolute,
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
import type { HotUpdatePayload } from '../plugins/vite-plugin-rsc-hmr.js';
import { viteHot } from '../plugins/vite-plugin-rsc-hmr.js';
import type { ClonableModuleNode } from '../middleware/types.js';

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
const configBasePath = getEnvironmentData('CONFIG_BASE_PATH') as string;
const configSrcDir = getEnvironmentData('CONFIG_SRC_DIR') as string;
const configEntries = getEnvironmentData('CONFIG_ENTRIES') as string;
const configPrivateDir = getEnvironmentData('CONFIG_PRIVATE_DIR') as string;

const resolveClientEntryForDev = (
  id: string,
  config: { rootDir: string; basePath: string },
  initialModules: ClonableModuleNode[],
) => {
  let file = id.startsWith('file://')
    ? decodeFilePathFromAbsolute(fileURLToFilePath(id))
    : id;
  for (const moduleNode of initialModules) {
    if (moduleNode.file === file) {
      return moduleNode.url;
    }
  }
  if (file.startsWith(config.rootDir)) {
    file = file.slice(config.rootDir.length + 1); // '+ 1' to remove '/'
  } else {
    file = '@fs' + encodeFilePathToAbsolute(file);
  }
  return config.basePath + file;
};

const handleErr = (id: number, err: unknown) => {
  const mesg: MessageRes = { id, type: 'err', err: `${err}` };
  if (hasStatusCode(err)) {
    mesg.statusCode = err.statusCode;
  }
  parentPort!.postMessage(mesg);
};

const handleRender = async (mesg: MessageReq & { type: 'render' }) => {
  const vite = await vitePromise;
  const {
    id,
    type: _removed,
    hasModuleIdCallback,
    initialModules,
    ...rest
  } = mesg;
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
        onError: (err) => {
          handleErr(id, err);
        },
      },
      {
        isDev: true,
        loadServerFile,
        resolveClientEntry: (id: string) =>
          resolveClientEntryForDev(
            id,
            {
              rootDir: vite.config.root,
              basePath: rest.config.basePath,
            },
            initialModules,
          ),
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
    handleErr(id, err);
  }
};

const handleGetSsrConfig = async (
  mesg: MessageReq & { type: 'getSsrConfig' },
) => {
  const vite = await vitePromise;
  const { id, config, pathname, searchParamsString, initialModules } = mesg;
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
          resolveClientEntryForDev(
            id,
            {
              rootDir: vite.config.root,
              basePath: config.basePath,
            },
            initialModules,
          ),
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
    handleErr(id, err);
  }
};

const dummyServer = new Server(); // FIXME we hope to avoid this hack

const hotUpdateCallback = (payload: HotUpdatePayload) => {
  const mesg: MessageRes = { type: 'hot-update', payload };
  parentPort!.postMessage(mesg);
};

const mergedViteConfig = await mergeUserViteConfig({
  // Since we have multiple instances of vite, different ones might overwrite the others' cache.
  cacheDir: 'node_modules/.vite/waku-dev-worker',
  plugins: [
    viteReact(),
    nonjsResolvePlugin(),
    rscEnvPlugin({}),
    rscPrivatePlugin({ privateDir: configPrivateDir, hotUpdateCallback }),
    rscManagedPlugin({ basePath: configBasePath, srcDir: configSrcDir }),
    rscTransformPlugin({ isClient: false, isBuild: false }),
    rscDelegatePlugin(hotUpdateCallback),
  ],
  optimizeDeps: {
    include: ['react-server-dom-webpack/client', 'react-dom'],
    exclude: ['waku'],
    entries: [
      `${configSrcDir}/${configEntries}.*`,
      // HACK hard-coded "pages"
      `${configSrcDir}/pages/**/*.*`,
    ],
  },
  ssr: {
    resolve: {
      conditions: ['react-server', 'workerd'],
      externalConditions: ['react-server', 'workerd'],
    },
    external: ['waku'],
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

const loadEntries = async (config: { srcDir: string }) => {
  const vite = await vitePromise;
  const filePath = joinPath(vite.config.root, config.srcDir, configEntries);
  return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
};

// load entries eagerly
loadEntries({ srcDir: configSrcDir }).catch(() => {
  // ignore
});

parentPort!.on('message', async (mesg: MessageReq) => {
  if (mesg.type === 'render') {
    await handleRender(mesg);
  } else if (mesg.type === 'getSsrConfig') {
    await handleGetSsrConfig(mesg);
  }
});
