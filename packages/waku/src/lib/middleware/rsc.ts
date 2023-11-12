import path from "node:path";
import fsPromises from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";

import { resolveConfig } from "../config.js";
import { renderHtml } from "./rsc/ssr.js";
import { decodeInput, hasStatusCode } from "./rsc/utils.js";
import {
  registerReloadCallback,
  registerImportCallback,
  renderRSC,
} from "./rsc/worker-api.js";
import { patchReactRefresh } from "../vite-plugin/patch-react-refresh.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

export function rsc<Context>(options: {
  command: "dev" | "start";
  ssr?: boolean;
  unstable_prehook?: (req: IncomingMessage, res: ServerResponse) => Context;
  unstable_posthook?: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: Context,
  ) => void;
}): Middleware {
  const { command, ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error("prehook is required if posthook is provided");
  }
  const configPromise = resolveConfig();

  let lastViteServer: ViteDevServer | undefined;
  const getViteServer = async (): Promise<ViteDevServer> => {
    if (lastViteServer) {
      return lastViteServer;
    }
    const config = await configPromise;
    const { createServer: viteCreateServer } = await import("vite");
    const { default: viteReact } = await import("@vitejs/plugin-react");
    const { rscIndexPlugin } = await import(
      "../vite-plugin/rsc-index-plugin.js"
    );
    const { rscHmrPlugin, hotImport } = await import(
      "../vite-plugin/rsc-hmr-plugin.js"
    );
    const viteServer = await viteCreateServer({
      root: path.join(config.rootDir, config.srcDir),
      optimizeDeps: {
        include: ["react-server-dom-webpack/client"],
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
        command === "dev"
          ? config.srcDir
          : path.join(config.distDir, config.publicDir),
        config.indexHtml,
      );
      publicIndexHtml = await fsPromises.readFile(publicIndexHtmlFile, {
        encoding: "utf8",
      });
    }
    if (command === "start") {
      const destFile = path.join(
        config.rootDir,
        config.distDir,
        config.publicDir,
        pathStr,
        pathStr.endsWith("/") ? "index.html" : "",
      );
      try {
        return await fsPromises.readFile(destFile, { encoding: "utf8" });
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
    return vite.transformIndexHtml(pathStr, publicIndexHtml);
  };

  return async (req, res, next) => {
    const config = await configPromise;
    const basePrefix = config.basePath + config.rscPath + "/";
    const pathStr = req.url || "";
    const handleError = (err: unknown) => {
      if (hasStatusCode(err)) {
        res.statusCode = err.statusCode;
      } else {
        console.info("Cannot render RSC", err);
        res.statusCode = 500;
      }
      if (command === "dev") {
        res.end(String(err));
      } else {
        res.end();
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
          readable.on("error", handleError);
          readable.pipe(res);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    if (pathStr.startsWith(basePrefix)) {
      const { method, headers } = req;
      if (method !== "GET" && method !== "POST") {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const [readable, nextCtx] = await renderRSC({
          input: decodeInput(pathStr.slice(basePrefix.length)),
          method,
          headers,
          command,
          context,
          stream: req,
        });
        unstable_posthook?.(req, res, nextCtx as Context);
        readable.on("error", handleError);
        readable.pipe(res);
      } catch (e) {
        handleError(e);
      }
      return;
    }
    if (command === "dev") {
      const vite = await getViteServer();
      // HACK re-export "?v=..." URL to avoid dual module hazard.
      const fname = pathStr.startsWith(config.basePath + "@fs/")
        ? pathStr.slice(config.basePath.length + 3)
        : path.join(vite.config.root, pathStr);
      for (const item of vite.moduleGraph.idToModuleMap.values()) {
        if (
          item.file === fname &&
          item.url !== pathStr &&
          !item.url.includes("?html-proxy")
        ) {
          res.setHeader("Content-Type", "application/javascript");
          res.statusCode = 200;
          res.end(`export * from "${item.url}";`, "utf8");
          return;
        }
      }
      vite.middlewares(req, res, next);
      return;
    }
    next();
  };
}
