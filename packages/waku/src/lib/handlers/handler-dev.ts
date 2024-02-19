import { Readable, Writable } from 'node:stream';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import type { Config } from '../../config.js';
import { resolveConfig } from '../config.js';
import {
  joinPath,
  fileURLToFilePath,
  decodeFilePathFromAbsolute,
} from '../utils/path.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { decodeInput, hasStatusCode } from '../renderers/utils.js';
import {
  initializeWorker,
  registerHotUpdateCallback,
  renderRscWithWorker,
  getSsrConfigWithWorker,
} from './dev-worker-api.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscHmrPlugin, hotUpdate } from '../plugins/vite-plugin-rsc-hmr.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import type { BaseReq, BaseRes, Handler } from './types.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';

export const CLIENT_MODULE_MAP = {
  react: 'react',
  'rd-server': 'react-dom/server.edge',
  'rsdw-client': 'react-server-dom-webpack/client.edge',
  'waku-client': 'waku/client',
};
export type CLIENT_MODULE_KEY = keyof typeof CLIENT_MODULE_MAP;

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
      plugins: [
        patchReactRefresh(viteReact()),
        rscEnvPlugin({ config, hydrate: ssr }),
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

  const willBeHandledByVite = async (pathname: string) => {
    const vite = await vitePromise;
    try {
      const result = await vite.transformRequest(pathname);
      return !!result;
    } catch {
      return false;
    }
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
        });
        unstable_posthook?.(req, res, nextCtx as Context);
        readable.pipeTo(res.stream);
      } catch (e) {
        handleError(e);
      }
      return;
    }
    if (ssr && !(await willBeHandledByVite(req.url.pathname))) {
      try {
        const readable = await renderHtml({
          config,
          pathname: req.url.pathname,
          searchParams: req.url.searchParams,
          htmlHead: `${config.htmlHead}
<script src="${config.basePath}${config.srcDir}/${config.mainJs}" async type="module"></script>`,
          renderRscForHtml: async (input, searchParams) => {
            const [readable, nextCtx] = await renderRscWithWorker({
              input,
              searchParamsString: searchParams.toString(),
              method: 'GET',
              contentType: undefined,
              config,
              context,
            });
            context = nextCtx as Context;
            return readable;
          },
          getSsrConfigForHtml: (pathname, options) =>
            getSsrConfigWithWorker(config, pathname, options),
          loadClientModule: (key) => import(CLIENT_MODULE_MAP[key]),
          isDev: true,
          rootDir: vite.config.root,
          loadServerFile,
        });
        if (readable) {
          unstable_posthook?.(req, res, context as Context);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          readable
            .pipeThrough(await transformIndexHtml(req.url.pathname))
            .pipeTo(res.stream);
          return;
        }
        next();
        return;
      } catch (e) {
        handleError(e);
        return;
      }
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
        const { code } = (await vite.transformRequest(item.url))!;
        res.setHeader('Content-Type', 'application/javascript');
        res.setStatus(200);
        let exports = `export * from "${item.url}";`;
        // `export *` does not re-export `default`
        if (code.includes('export default')) {
          exports += `export { default } from "${item.url}";`;
        }
        endStream(res.stream, exports);
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
