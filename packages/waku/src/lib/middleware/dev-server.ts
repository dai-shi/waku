import { Readable, Writable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import { resolveConfig } from '../config.js';
import {
  joinPath,
  fileURLToFilePath,
  decodeFilePathFromAbsolute,
} from '../utils/path.js';
import { stringToStream } from '../utils/stream.js';
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
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';
import type { Middleware } from './types.js';

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
  const configPromise = resolveConfig(options.config || {});
  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      base: config.basePath,
      plugins: [
        patchReactRefresh(viteReact()),
        rscEnvPlugin({ config }),
        rscPrivatePlugin(config),
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

  return async (ctx, next) => {
    const [config, vite] = await Promise.all([configPromise, vitePromise]);
    ctx.devServer = {
      rootDir: vite.config.root,
      renderRscWithWorker,
      getSsrConfigWithWorker,
      loadServerFile,
      transformIndexHtml,
    };

    await next();
    if (ctx.res.body) {
      return;
    }

    // HACK re-export "?v=..." URL to avoid dual module hazard.
    const viteUrl = ctx.req.url.toString().slice(ctx.req.url.origin.length);
    const fname = viteUrl.startsWith(config.basePath + '@fs/')
      ? decodeFilePathFromAbsolute(
          viteUrl.slice(config.basePath.length + '@fs'.length),
        )
      : joinPath(vite.config.root, viteUrl);
    for (const item of vite.moduleGraph.idToModuleMap.values()) {
      if (
        item.file === fname &&
        item.url !== viteUrl &&
        !item.url.includes('?html-proxy')
      ) {
        const { code } = (await vite.transformRequest(item.url))!;
        ctx.res.headers = {
          ...ctx.res.headers,
          'content-type': 'application/javascript',
        };
        ctx.res.status = 200;
        let exports = `export * from "${item.url}";`;
        // `export *` does not re-export `default`
        if (code.includes('export default')) {
          exports += `export { default } from "${item.url}";`;
        }
        ctx.res.body = stringToStream(exports);
        return;
      }
    }
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
