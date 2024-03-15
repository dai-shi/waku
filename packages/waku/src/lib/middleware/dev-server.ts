import { Readable, Writable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import { resolveConfig } from '../config.js';
import { fileURLToFilePath } from '../utils/path.js';
import {
  initializeWorker,
  registerHotUpdateCallback,
  renderRscWithWorker,
  getSsrConfigWithWorker,
} from '../renderers/dev-worker-api.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscHmrPlugin, hotUpdate } from '../plugins/vite-plugin-rsc-hmr.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import { rscManagedPlugin } from '../plugins/vite-plugin-rsc-managed.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';
import type { ClonableModuleNode, Middleware } from './types.js';

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

export const devServer: Middleware = (options) => {
  if (options.cmd !== 'dev') {
    // pass through if not dev command
    return (_ctx, next) => next();
  }

  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const configPromise = resolveConfig(options.config);
  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      // Since we have multiple instances of vite, different ones might overwrite the others' cache. That's why we change it for this one.
      cacheDir: 'node_modules/.vite/waku-dev-server',
      base: config.basePath,
      plugins: [
        patchReactRefresh(viteReact()),
        rscEnvPlugin({ config }),
        rscPrivatePlugin(config),
        rscManagedPlugin(config),
        rscIndexPlugin(config),
        rscHmrPlugin(),
        { name: 'nonjs-resolve-plugin' }, // dummy to match with dev-worker-impl.ts
        { name: 'rsc-transform-plugin' }, // dummy to match with dev-worker-impl.ts
        { name: 'rsc-delegate-plugin' }, // dummy to match with dev-worker-impl.ts
      ],
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react-dom'],
        exclude: ['waku'],
        entries: [
          `${config.srcDir}/${config.entriesJs}`.replace(/\.js$/, '.*'),
        ],
      },
      ssr: {
        external: [
          'waku',
          'waku/client',
          'waku/server',
          'waku/router/client',
          'waku/router/server',
        ],
      },
      server: { middlewareMode: true },
    });
    const vite = await createViteServer(mergedViteConfig);
    initializeWorker(config);
    registerHotUpdateCallback((payload) => hotUpdate(vite, payload));
    return vite;
  });

  const loadServerFile = async (fileURL: string) => {
    const vite = await vitePromise;
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
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

  const willBeHandledLater = async (pathname: string) => {
    const vite = await vitePromise;
    try {
      const result = await vite.transformRequest(pathname);
      return !!result;
    } catch {
      return false;
    }
  };

  let initialModules: ClonableModuleNode[];

  return async (ctx, next) => {
    const [{ middleware: _removed, ...config }, vite] = await Promise.all([
      configPromise,
      vitePromise,
    ]);

    if (!initialModules) {
      // pre-process the mainJs file to see which modules are being sent to the browser by vite
      // and using the same modules if possible in the bundlerConfig in the stream
      const mainJs = `${config.basePath}${config.srcDir}/${config.mainJs}`;
      await vite.transformRequest(mainJs);
      const resolved = await vite.pluginContainer.resolveId(mainJs);
      const resolvedModule = vite.moduleGraph.idToModuleMap.get(resolved!.id)!;
      await Promise.all(
        [...resolvedModule.importedModules].map(({ id }) =>
          id ? vite.warmupRequest(id) : null,
        ),
      );

      initialModules = Array.from(vite.moduleGraph.idToModuleMap.values()).map(
        (m) => ({ url: m.url, file: m.file! }),
      );
    }

    ctx.devServer = {
      rootDir: vite.config.root,
      initialModules,
      renderRscWithWorker,
      getSsrConfigWithWorker,
      loadServerFile,
      transformIndexHtml,
      willBeHandledLater,
    };

    await next();
    if (ctx.res.body) {
      return;
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
