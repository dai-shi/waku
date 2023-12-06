import type { ViteDevServer } from 'vite';

import type { Config } from '../../config.js';
import { resolveConfig } from '../config.js';
import { joinPath, filePathToFileURL, extname } from '../utils/path.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from './rsc/ssr.js';
import { decodeInput, hasStatusCode, deepFreeze } from './rsc/utils.js';
import {
  registerReloadCallback,
  registerImportCallback,
  renderRSC as renderRSCWorker,
} from './rsc/worker-api.js';
import { renderRSC } from '../rsc/renderer.js';
import { patchReactRefresh } from '../vite-plugin/patch-react-refresh.js';
import type { BaseReq, BaseRes, Middleware } from './types.js';

export function rsc<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  config: Config;
  command: 'dev' | 'start';
  ssr?: boolean;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
}): Middleware<Req, Res> {
  const { command, ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  const configPromise = resolveConfig(options.config);

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
      root: joinPath(config.rootDir, config.srcDir),
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
    if (command === 'start') {
      if (!publicIndexHtml) {
        const publicIndexHtmlJsFile = joinPath(
          config.rootDir,
          config.distDir,
          config.htmlsDir,
          config.indexHtml + '.js',
        );
        publicIndexHtml = (
          await import(filePathToFileURL(publicIndexHtmlJsFile))
        ).default as string;
      }
      const destHtmlJsFile = joinPath(
        config.rootDir,
        config.distDir,
        config.htmlsDir,
        (extname(pathStr) ? pathStr : pathStr + '/' + config.indexHtml) + '.js',
      );
      try {
        return (await import(filePathToFileURL(destHtmlJsFile)))
          .default as string;
      } catch (e) {
        return publicIndexHtml;
      }
    }
    // command === "dev"
    const { readFile, stat } = await import('../utils/node-fs.js');
    if (!publicIndexHtml) {
      const publicIndexHtmlFile = joinPath(
        config.rootDir,
        config.srcDir,
        config.indexHtml,
      );
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
    if (command !== 'dev') {
      if (pathStr.startsWith(basePrefix)) {
        const { method, headers } = req;
        if (method !== 'GET' && method !== 'POST') {
          throw new Error(`Unsupported method '${method}'`);
        }
        try {
          const input = decodeInput(pathStr.slice(basePrefix.length));
          const readable = await renderRSC({
            config,
            input,
            method,
            context,
            body: req.stream,
            contentType: headers['content-type'] as string | undefined,
            isDev: false,
          });
          unstable_posthook?.(req, res, context as Context);
          deepFreeze(context);
          readable.pipeTo(res.stream);
        } catch (e) {
          handleError(e);
        }
        return;
      }
    } else {
      // command === 'dev'
      if (pathStr.startsWith(basePrefix)) {
        const { method, headers } = req;
        if (method !== 'GET' && method !== 'POST') {
          throw new Error(`Unsupported method '${method}'`);
        }
        try {
          const input = decodeInput(pathStr.slice(basePrefix.length));
          const [readable, nextCtx] = await renderRSCWorker({
            input,
            method,
            headers,
            config,
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
      const vite = await getViteServer();
      // TODO Do we still need this?
      // HACK re-export "?v=..." URL to avoid dual module hazard.
      const fname = pathStr.startsWith(config.basePath + '@fs/')
        ? pathStr.slice(config.basePath.length + 3)
        : joinPath(vite.config.root, pathStr);
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
