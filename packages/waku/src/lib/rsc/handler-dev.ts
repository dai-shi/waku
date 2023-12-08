import { Readable, Writable } from 'node:stream';
import type { ViteDevServer } from 'vite';
import { createServer as viteCreateServer } from 'vite';
import { default as viteReact } from '@vitejs/plugin-react';

import type { Config } from '../../config.js';
import { resolveConfig } from '../config.js';
import { joinPath } from '../utils/path.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from './html-renderer.js';
import { decodeInput, hasStatusCode } from './utils.js';
import { readFile, stat } from '../utils/node-fs.js';
import {
  registerReloadCallback,
  registerImportCallback,
  renderRscWithWorker,
} from './worker-api.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscHmrPlugin, hotImport } from '../plugins/vite-plugin-rsc-hmr.js';
import type { BaseReq, BaseRes, Handler } from './types.js';

export function createHandler<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  config: Config;
  ssr?: boolean;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
}): Handler<Req, Res> {
  const { ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  const configPromise = resolveConfig(options.config);

  let lastViteServer: ViteDevServer | undefined;
  const getViteServer = async (): Promise<ViteDevServer> => {
    if (lastViteServer) {
      return lastViteServer;
    }
    const config = await configPromise;
    const viteServer = await viteCreateServer({
      base: config.basePath,
      optimizeDeps: {
        include: ['react-server-dom-webpack/client'],
        exclude: ['waku'],
      },
      plugins: [
        patchReactRefresh(viteReact()),
        rscIndexPlugin([]),
        rscHmrPlugin(),
      ],
      server: { middlewareMode: true },
    });
    registerReloadCallback((type) => viteServer.ws.send({ type }));
    registerImportCallback((source) => hotImport(viteServer, source));
    lastViteServer = viteServer;
    return viteServer;
  };

  let publicIndexHtml: string | undefined;
  const getHtmlStr = async (pathStr: string): Promise<string | null> => {
    const config = await configPromise;
    if (!publicIndexHtml) {
      const publicIndexHtmlFile = joinPath(config.rootDir, config.indexHtml);
      publicIndexHtml = await readFile(publicIndexHtmlFile, {
        encoding: 'utf8',
      });
    }
    const vite = await getViteServer();
    for (const item of vite.moduleGraph.idToModuleMap.values()) {
      if (item.url === pathStr) {
        return null;
      }
    }
    const destFile = joinPath(config.rootDir, config.srcDir, pathStr);
    try {
      // check if destFile exists
      const stats = await stat(destFile);
      if (stats.isFile()) {
        return null;
      }
    } catch (e) {
      // does not exist
    }
    // FIXME: otherwise SSR on Windows will fail
    if (pathStr.startsWith('/@fs')) {
      return null;
    }
    return vite.transformIndexHtml(pathStr, publicIndexHtml);
  };

  return async (req, res, next) => {
    const config = await configPromise;
    const basePrefix = config.basePath + config.rscPath + '/';
    const pathStr = req.url.slice(new URL(req.url).origin.length);
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
        const htmlStr = await getHtmlStr(pathStr);
        const result =
          htmlStr &&
          (await renderHtml(config, true, pathStr, htmlStr, context));
        if (result) {
          const [readable, nextCtx] = result;
          unstable_posthook?.(req, res, nextCtx as Context);
          readable.pipeTo(res.stream);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    if (pathStr.startsWith(basePrefix)) {
      const { method, contentType } = req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const input = decodeInput(pathStr.slice(basePrefix.length));
        const [readable, nextCtx] = await renderRscWithWorker({
          input,
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
    const vite = await getViteServer();
    const viteReq: any = Readable.fromWeb(req.stream as any);
    viteReq.method = req.method;
    viteReq.url = pathStr;
    viteReq.headers = { 'content-type': req.contentType };
    const viteRes: any = Writable.fromWeb(res.stream as any);
    Object.defineProperty(viteRes, 'statusCode', {
      set(code) {
        res.setStatus(code);
      },
    });
    viteRes.setHeader = (name: string, value: string) => {
      res.setHeader(name, value);
    };
    viteRes.writeHead = (code: number, headers?: Record<string, string>) => {
      res.setStatus(code);
      for (const [name, value] of Object.entries(headers || {})) {
        res.setHeader(name, value);
      }
    };
    vite.middlewares(viteReq, viteRes, next);
    return;
  };
}
