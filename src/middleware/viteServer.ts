import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { MiddlewareCreator } from "./common.js";

const rscPlugin = (
  scriptToInject: (path: string) => Promise<string>
): Plugin => {
  return {
    name: "rscPlugin",
    async transformIndexHtml(_html, ctx) {
      const code = await scriptToInject(ctx.path);
      if (code) {
        return [
          {
            tag: "script",
            children: code,
            injectTo: "body",
          },
        ];
      }
    },
  };
};

const viteServer: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.devServer?.dir || ".");
  const indexHtml = config.files?.indexHtml || "index.html";
  const indexHtmlFile = path.join(dir, indexHtml);
  const vitePromise = createServer({
    root: dir,
    plugins: [
      // @ts-ignore
      react(),
      rscPlugin(async (path: string) => shared.devScriptToInject?.(path) || ""),
    ],
    server: { middlewareMode: true },
    appType: "custom",
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const indexFallback = async () => {
      const url = new URL(req.url || "", "http://" + req.headers.host);
      // TODO make it configurable?
      const hasExtension = url.pathname.split(".").length > 1;
      if (!hasExtension) {
        const fname = indexHtmlFile;
        if (fs.existsSync(fname)) {
          let content = await fsPromises.readFile(fname, { encoding: "utf-8" });
          content = await vite.transformIndexHtml(req.url || "", content);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(content);
          return;
        }
        res.statusCode = 404;
        res.end();
        return;
      }
      await next();
    };
    return new Promise((resolve, reject) =>
      vite.middlewares(req, res, (err: unknown) =>
        err ? reject(err) : resolve(indexFallback())
      )
    );
  };
};

export default viteServer;
