import { Readable, Writable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import { default as viteReact } from '@vitejs/plugin-react';

import type { EntriesDev } from '../../server.js';
import { resolveConfig } from '../config.js';
import type { Config } from '../config.js';
import { joinPath, decodeFilePathFromAbsolute } from '../utils/path.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { decodeInput, hasStatusCode } from '../renderers/utils.js';
import {
  registerReloadCallback,
  registerImportCallback,
  renderRscWithWorker,
  registerModuleCallback,
} from './dev-worker-api.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import {
  rscHmrPlugin,
  hotImport,
  moduleImport,
} from '../plugins/vite-plugin-rsc-hmr.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import type { BaseReq, BaseRes, Handler } from './types.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';

export function createHandler<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  config?: Config;
  ssr?: boolean;
  env?: Record<string, string>;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
}): Handler<Req, Res> {
  const { ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const configPromise = resolveConfig(options.config || {});
  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      base: config.basePath,
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react', 'react-dom'],
        exclude: ['waku'],
      },
      plugins: [
        nonjsResolvePlugin(),
        patchReactRefresh(viteReact()),
        rscIndexPlugin(config),
        rscHmrPlugin(),
        rscEnvPlugin({ config, hydrate: ssr }),
      ],
      ssr: {
        external: ['waku'],
      },
      server: { middlewareMode: true },
    });
    const viteServer = await createViteServer(mergedViteConfig);
    registerReloadCallback((type) => viteServer.ws.send({ type }));
    registerImportCallback((source) => hotImport(viteServer, source));
    registerModuleCallback((result) => moduleImport(viteServer, result));
    return viteServer;
  });

  const entries = Promise.all([configPromise, vitePromise]).then(
    async ([config, vite]) => {
      const filePath = joinPath(
        vite.config.root,
        config.srcDir,
        config.entriesJs,
      );
      return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
    },
  );

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
          return new Promise<void>((resolve) => {
            vite.transformIndexHtml(pathname, data).then((result) => {
              controller.enqueue(encoder.encode(result));
              resolve();
            });
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

  return async (req, res, next) => {
    const [config, vite] = await Promise.all([configPromise, vitePromise]);
    const basePrefix = config.basePath + config.rscPath + '/';
    const handleError = (err: unknown) => {
      if (hasStatusCode(err)) {
        res.setStatus(err.statusCode);
      } else {
        console.info('Cannot render RSC', err);
        res.setStatus(500);
      }
      endStream(res.stream, String(err));
    };
    let context: Context | undefined;
    try {
      context = unstable_prehook?.(req, res);
    } catch (e) {
      handleError(e);
      return;
    }
    if (ssr) {
      try {
        const readable = await renderHtml({
          config,
          pathname: req.url.pathname,
          searchParams: req.url.searchParams,
          htmlHead: `${config.htmlHead}
<script src="/${config.srcDir}/${config.mainJs}" async type="module"></script>`,
          renderRscForHtml: async (input, searchParams) => {
            const [readable, nextCtx] = await renderRscWithWorker({
              input,
              searchParamsString: searchParams.toString(),
              method: 'GET',
              contentType: undefined,
              config,
              context,
              env: (globalThis as any).__WAKU_PRIVATE_ENV__,
            });
            context = nextCtx as Context;
            return readable;
          },
          isDev: true,
          entries: await entries,
        });
        if (readable) {
          unstable_posthook?.(req, res, context as Context);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          readable
            .pipeThrough(await transformIndexHtml(req.url.pathname))
            .pipeTo(res.stream);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    if (req.url.pathname.startsWith(basePrefix)) {
      const { method, contentType } = req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const input = decodeInput(req.url.pathname.slice(basePrefix.length));
        const [readable, nextCtx] = await renderRscWithWorker({
          input,
          searchParamsString: req.url.searchParams.toString(),
          method,
          contentType,
          config,
          context,
          stream: req.stream,
          env: (globalThis as any).__WAKU_PRIVATE_ENV__,
        });
        unstable_posthook?.(req, res, nextCtx as Context);
        readable.pipeTo(res.stream);
      } catch (e) {
        handleError(e);
      }
      return;
    }
    // HACK re-export "?v=..." URL to avoid dual module hazard.
    const viteUrl = req.url.toString().slice(req.url.origin.length);
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
        res.setHeader('Content-Type', 'application/javascript');
        res.setStatus(200);
        endStream(res.stream, `export * from "${item.url}";`);
        return;
      }
    }
    const viteReq: any = Readable.fromWeb(req.stream as any);
    viteReq.method = req.method;
    viteReq.url = viteUrl;
    viteReq.headers = { 'content-type': req.contentType };
    const viteRes: any = Writable.fromWeb(res.stream as any);
    Object.defineProperty(viteRes, 'statusCode', {
      set(code) {
        res.setStatus(code);
      },
    });
    const headers = new Map<string, string>();
    viteRes.setHeader = (name: string, value: string) => {
      headers.set(name, value);
      res.setHeader(name, value);
    };
    viteRes.getHeader = (name: string) => headers.get(name);
    viteRes.writeHead = (code: number, headers?: Record<string, string>) => {
      res.setStatus(code);
      for (const [name, value] of Object.entries(headers || {})) {
        viteRes.setHeader(name, value);
      }
    };
    vite.middlewares(viteReq, viteRes, next);
    return;
  };
}
