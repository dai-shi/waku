import { Readable, Writable } from 'node:stream';
import { Server } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import type { EntriesDev } from '../../server.js';
import { resolveConfig } from '../config.js';
import { SRC_MAIN, SRC_ENTRIES } from '../constants.js';
import {
  joinPath,
  fileURLToFilePath,
  encodeFilePathToAbsolute,
  decodeFilePathFromAbsolute,
  filePathToFileURL,
} from '../utils/path.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { devCommonJsPlugin } from '../plugins/vite-plugin-dev-commonjs.js';
import { rscRsdwPlugin } from '../plugins/vite-plugin-rsc-rsdw.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscHmrPlugin, hotUpdate } from '../plugins/vite-plugin-rsc-hmr.js';
import type { HotUpdatePayload } from '../plugins/vite-plugin-rsc-hmr.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import { rscManagedPlugin } from '../plugins/vite-plugin-rsc-managed.js';
import { rscDelegatePlugin } from '../plugins/vite-plugin-rsc-delegate.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';
import type { ClonableModuleNode, Middleware } from './types.js';
import { fsRouterTypegenPlugin } from '../plugins/vite-plugin-fs-router-typegen.js';

// TODO there is huge room for refactoring in this file

// For react-server-dom-webpack/server.edge
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

const createStreamPair = (): [Writable, Promise<ReadableStream | null>] => {
  let controller: ReadableStreamDefaultController | undefined;
  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = undefined;
    },
  });
  let resolve: (value: ReadableStream | null) => void;
  const promise = new Promise<ReadableStream | null>((r) => (resolve = r));
  let hasData = false;
  const writable = new Writable({
    write(chunk, encoding, callback) {
      if (encoding !== ('buffer' as any)) {
        throw new Error('Unknown encoding');
      }
      if (controller) {
        controller.enqueue(chunk);
        if (!hasData) {
          hasData = true;
          resolve(readable);
        }
      }
      callback();
    },
    final(callback) {
      if (controller) {
        controller.close();
        if (!hasData) {
          resolve(null);
        }
      }
      callback();
    },
  });
  return [writable, promise];
};

const hotUpdateCallbackSet = new Set<(payload: HotUpdatePayload) => void>();
const registerHotUpdateCallback = (fn: (payload: HotUpdatePayload) => void) =>
  hotUpdateCallbackSet.add(fn);
const hotUpdateCallback = (payload: HotUpdatePayload) =>
  hotUpdateCallbackSet.forEach((fn) => fn(payload));

const createMainViteServer = (
  env: Record<string, string>,
  configPromise: ReturnType<typeof resolveConfig>,
) => {
  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      // Since we have multiple instances of vite, different ones might overwrite the others' cache.
      cacheDir: 'node_modules/.vite/waku-dev-server-main',
      base: config.basePath,
      plugins: [
        patchReactRefresh(viteReact()),
        nonjsResolvePlugin(),
        devCommonJsPlugin({
          filter: (id) => {
            if (
              id.includes('/node_modules/react-server-dom-webpack/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react/')
            ) {
              return true;
            }
          },
        }),
        rscRsdwPlugin(),
        rscEnvPlugin({ isDev: true, env, config }),
        rscPrivatePlugin(config),
        rscManagedPlugin(config),
        rscIndexPlugin(config),
        rscTransformPlugin({ isClient: true, isBuild: false }),
        rscHmrPlugin(),
        fsRouterTypegenPlugin(config),
      ],
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react-dom'],
        exclude: ['waku', 'rsc-html-stream/server'],
        entries: [
          `${config.srcDir}/${SRC_ENTRIES}.*`,
          // HACK hard-coded "pages"
          `${config.srcDir}/pages/**/*.*`,
        ],
      },
      ssr: {
        external: ['waku'],
      },
      appType: 'mpa',
      server: { middlewareMode: true },
    });
    const vite = await createViteServer(mergedViteConfig);
    registerHotUpdateCallback((payload) => hotUpdate(vite, payload));
    return vite;
  });

  const loadServerModuleMain = async (idOrFileURL: string) => {
    const vite = await vitePromise;
    if (idOrFileURL === 'waku' || idOrFileURL.startsWith('waku/')) {
      // HACK `external: ['waku']` doesn't do the same
      return import(/* @vite-ignore */ idOrFileURL);
    }
    if (
      idOrFileURL.startsWith('file://') &&
      idOrFileURL.includes('/node_modules/')
    ) {
      // HACK node_modules should be externalized
      const file = fileURLToFilePath(idOrFileURL);
      const fileWithAbsolutePath = file.startsWith('/')
        ? file
        : joinPath(vite.config.root, file);
      return import(/* @vite-ignore */ filePathToFileURL(fileWithAbsolutePath));
    }
    return vite.ssrLoadModule(
      idOrFileURL.startsWith('file://')
        ? fileURLToFilePath(idOrFileURL)
        : idOrFileURL,
    );
  };

  const transformIndexHtml = async (pathname: string) => {
    const vite = await vitePromise;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let headSent = false;
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        if (!headSent) {
          headSent = true;
          let data = decoder.decode(chunk);
          // FIXME without removing async, Vite will move it
          // to the proxy cache, which breaks __WAKU_PUSH__.
          data = data.replace(/<script type="module" async>/, '<script>');
          return new Promise<void>((resolve, reject) => {
            vite
              .transformIndexHtml(pathname, data)
              .then((result) => {
                controller.enqueue(encoder.encode(result));
                resolve();
              })
              .catch(reject);
          });
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (!headSent) {
          throw new Error('head not yet sent');
        }
      },
    });
  };

  // TODO We might be able to elminate this function
  const willBeHandled = async (pathname: string) => {
    const vite = await vitePromise;
    try {
      const result = await vite.transformRequest(pathname);
      return !!result;
    } catch {
      return false;
    }
  };

  return {
    vitePromise,
    loadServerModuleMain,
    transformIndexHtml,
    willBeHandled,
  };
};

const createRscViteServer = (
  env: Record<string, string>,
  configPromise: ReturnType<typeof resolveConfig>,
) => {
  const dummyServer = new Server(); // FIXME we hope to avoid this hack

  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      // Since we have multiple instances of vite, different ones might overwrite the others' cache.
      cacheDir: 'node_modules/.vite/waku-dev-server-rsc',
      plugins: [
        viteReact(),
        nonjsResolvePlugin(),
        devCommonJsPlugin({}),
        rscRsdwPlugin(),
        rscEnvPlugin({ isDev: true, env }),
        rscPrivatePlugin({ privateDir: config.privateDir, hotUpdateCallback }),
        rscManagedPlugin({ basePath: config.basePath, srcDir: config.srcDir }),
        rscTransformPlugin({ isClient: false, isBuild: false }),
        rscDelegatePlugin(hotUpdateCallback),
      ],
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react-dom'],
        exclude: ['waku'],
        entries: [
          `${config.srcDir}/${SRC_ENTRIES}.*`,
          // HACK hard-coded "pages"
          `${config.srcDir}/pages/**/*.*`,
        ],
      },
      ssr: {
        resolve: {
          conditions: ['react-server'],
          externalConditions: ['react-server'],
        },
        noExternal: /^(?!node:)/,
        optimizeDeps: {
          include: [
            'react-server-dom-webpack/server.edge',
            'react',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
          ],
          exclude: ['waku'],
        },
      },
      appType: 'custom',
      server: { middlewareMode: true, hmr: { server: dummyServer } },
    });
    const vite = await createViteServer(mergedViteConfig);
    return vite;
  });

  const loadServerModuleRsc = async (idOrFileURL: string) => {
    const vite = await vitePromise;
    return vite.ssrLoadModule(
      idOrFileURL.startsWith('file://')
        ? fileURLToFilePath(idOrFileURL)
        : idOrFileURL,
    );
  };

  const loadEntriesDev = async (config: { srcDir: string }) => {
    const vite = await vitePromise;
    const filePath = joinPath(vite.config.root, config.srcDir, SRC_ENTRIES);
    return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
  };

  const resolveClientEntry = (
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

  return {
    loadServerModuleRsc,
    loadEntriesDev,
    resolveClientEntry,
  };
};

export const devServer: Middleware = (options) => {
  if (options.cmd !== 'dev') {
    // pass through if not dev command
    return (_ctx, next) => next();
  }

  const env = options.env || {};
  const configPromise = resolveConfig(options.config);

  (globalThis as any).__WAKU_SERVER_IMPORT__ = (id: string) =>
    loadServerModuleRsc(id);

  (globalThis as any).__WAKU_CLIENT_IMPORT__ = (id: string) =>
    loadServerModuleMain(id);

  const {
    vitePromise,
    loadServerModuleMain,
    transformIndexHtml,
    willBeHandled,
  } = createMainViteServer(env, configPromise);

  const { loadServerModuleRsc, loadEntriesDev, resolveClientEntry } =
    createRscViteServer(env, configPromise);

  let initialModules: ClonableModuleNode[];

  return async (ctx, next) => {
    const [{ middleware: _removed, ...config }, vite] = await Promise.all([
      configPromise,
      vitePromise,
    ]);

    if (!initialModules) {
      const processedModules = new Set<string>();

      const processModule = async (modulePath: string) => {
        if (processedModules.has(modulePath)) {
          return;
        }
        processedModules.add(modulePath);

        await vite.transformRequest(modulePath);
        const resolved = await vite.pluginContainer.resolveId(modulePath);
        if (!resolved) {
          return;
        }

        const module = vite.moduleGraph.idToModuleMap.get(resolved.id);
        if (!module) {
          return;
        }

        await Promise.all(
          Array.from(module.importedModules).map(async (importedModule) => {
            if (importedModule.id) {
              await processModule(importedModule.id);
            }
          }),
        );
      };

      const mainJs = `${config.basePath}${config.srcDir}/${SRC_MAIN}`;
      const entriesFile = `${vite.config.root}${config.basePath}${config.srcDir}/${SRC_ENTRIES}`;

      await processModule(mainJs);
      await processModule(entriesFile);

      initialModules = Array.from(
        vite.moduleGraph.idToModuleMap.values(),
      ).flatMap((m) => (m.file ? [{ url: m.url, file: m.file }] : []));
    }

    ctx.unstable_devServer = {
      rootDir: vite.config.root,
      resolveClientEntry: (id: string) =>
        resolveClientEntry(
          id,
          {
            rootDir: vite.config.root,
            basePath: config.basePath,
          },
          initialModules,
        ),
      loadServerModuleRsc,
      loadEntriesDev,
      loadServerModuleMain,
      transformIndexHtml,
    };

    if (
      // HACK depending on `rscBase` is a bad idea
      // FIXME This hack should be removed as well as `willBeHandled`
      ctx.req.url.pathname.startsWith(config.basePath + config.rscBase + '/') ||
      !(await willBeHandled(ctx.req.url.pathname))
    ) {
      await next();
      if (ctx.res.body) {
        return;
      }
    }

    const viteUrl = ctx.req.url.toString().slice(ctx.req.url.origin.length);
    const viteReq: any = Readable.fromWeb(ctx.req.body as any);
    viteReq.method = ctx.req.method;
    viteReq.url = viteUrl;
    viteReq.headers = ctx.req.headers;
    const [writable, readablePromise] = createStreamPair();
    const viteRes: any = writable;
    Object.defineProperty(viteRes, 'statusCode', {
      set(code) {
        ctx.res.status = code;
      },
    });
    const headers = new Map<string, string>();
    viteRes.setHeader = (name: string, value: string) => {
      headers.set(name, value);
      ctx.res.headers = {
        ...ctx.res.headers,
        [name]: String(value),
      };
    };
    viteRes.getHeader = (name: string) => headers.get(name);
    viteRes.writeHead = (code: number, headers?: Record<string, string>) => {
      ctx.res.status = code;
      for (const [name, value] of Object.entries(headers || {})) {
        viteRes.setHeader(name, value);
      }
    };
    vite.middlewares(viteReq, viteRes);
    const body = await readablePromise;
    if (body) {
      ctx.res.body = body;
    }
  };
};
