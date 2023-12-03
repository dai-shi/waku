import path from 'node:path'; // TODO no node dependency
import fsPromises from 'node:fs/promises'; // TODO no node dependency
import type { ViteDevServer } from 'vite';

import { setCwd, resolveConfig } from '../config.js';
import { renderHtml } from './rsc/ssr.js';
import { decodeInput, hasStatusCode, endStream } from './rsc/utils.js';
import {
  registerReloadCallback,
  registerImportCallback,
  renderRSC,
} from './rsc/worker-api.js';
import { patchReactRefresh } from '../vite-plugin/patch-react-refresh.js';
import type { BaseReq, BaseRes, Middleware } from './types.js';

export function rsc<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  cwd: string;
  command: 'dev' | 'start';
  ssr?: boolean;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
}): Middleware<Req, Res> {
  setCwd(options.cwd);
  const { command, ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  const configPromise = resolveConfig();

  let lastViteServer: ViteDevServer | undefined;
  const getViteServer = async (): Promise<ViteDevServer> => {
    if (lastViteServer) {
      return lastViteServer;
    }
    const [
      config,
      { viteInlineConfig },
      { createServer: viteCreateServer },
      { default: viteReact },
      { rscIndexPlugin },
      { rscHmrPlugin, hotImport },
    ] = await Promise.all([
      configPromise,
      import('../config.js'),
      import('vite'),
      import('@vitejs/plugin-react'),
      import('../vite-plugin/rsc-index-plugin.js'),
      import('../vite-plugin/rsc-hmr-plugin.js'),
    ]);
    const viteServer = await viteCreateServer({
      ...(await viteInlineConfig()),
      root: path.join(config.rootDir, config.srcDir),
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
      const publicIndexHtmlFile = path.join(
        config.rootDir,
        command === 'dev'
          ? config.srcDir
          : path.join(config.distDir, config.publicDir),
        config.indexHtml,
      );
      publicIndexHtml = await fsPromises.readFile(publicIndexHtmlFile, {
        encoding: 'utf8',
      });
    }
    if (command === 'start') {
      const destFile = path.join(
        config.rootDir,
        config.distDir,
        config.publicDir,
        pathStr,
        pathStr.endsWith('/') ? 'index.html' : '',
      );
      try {
        return await fsPromises.readFile(destFile, { encoding: 'utf8' });
      } catch (e) {
        return publicIndexHtml;
      }
    }
    // command === "dev"
    const vite = await getViteServer();
    for (const item of vite.moduleGraph.idToModuleMap.values()) {
      if (item.url === pathStr) {
        return null;
      }
    }
    const destFile = path.join(config.rootDir, config.srcDir, pathStr);
    try {
      // check if exists?
      const stats = await fsPromises.stat(destFile);
      if (stats.isFile()) {
        return null;
      }
    } catch (e) {
      // does not exist
    }
    // fixme: otherwise SSR on Windows will fail
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
      if (command === 'dev') {
        endStream(res.stream, String(err));
      } else {
        endStream(res.stream);
      }
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
          (await renderHtml(config, command, pathStr, htmlStr, context));
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
      const { method, headers } = req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const input = decodeInput(pathStr.slice(basePrefix.length));
        const [readable, nextCtx] = await renderRSC({
          input,
          method,
          headers,
          command,
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
    if (command === 'dev') {
      const vite = await getViteServer();
      // TODO Do we still need this?
      // HACK re-export "?v=..." URL to avoid dual module hazard.
      const fname = pathStr.startsWith(config.basePath + '@fs/')
        ? pathStr.slice(config.basePath.length + 3)
        : path.join(vite.config.root, pathStr);
      for (const item of vite.moduleGraph.idToModuleMap.values()) {
        if (
          item.file === fname &&
          item.url !== pathStr &&
          !item.url.includes('?html-proxy')
        ) {
          res.setHeader('Content-Type', 'application/javascript');
          res.setStatus(200);
          endStream(res.stream, `export * from "${item.url}";`);
          return;
        }
      }
      const { Readable, Writable } = await import('node:stream');
      const viteReq: any = Readable.fromWeb(req.stream as any);
      viteReq.method = req.method;
      viteReq.url = pathStr;
      viteReq.headers = req.headers;
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
    }
    next();
  };
}
