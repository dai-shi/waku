import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import url from "node:url";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { MiddlewareCreator } from "./common.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const rscPlugin = (
  scriptToInject?: (path: string) => Promise<string>
): Plugin => {
  return {
    name: "rscPlugin",
    async transformIndexHtml(_html, ctx) {
      if (scriptToInject) {
        return [
          {
            tag: "script",
            children: await scriptToInject(ctx.path),
            injectTo: "body",
          },
        ];
      }
    },
  };
};

const viteServer: MiddlewareCreator = (config) => {
  const dir = path.resolve(config.devServer?.dir || ".");
  const indexHtmlFile = path.resolve(
    dir,
    config.files?.indexHtml || "index.html"
  );
  const vitePromise = createServer({
    root: dir,
    resolve: {
      alias: {
        "wakuwork/client": path.resolve(__dirname, "..", "client.js"),
      },
    },
    plugins: [
      // @ts-ignore
      react(),
      rscPlugin(config.devServer?.INTERNAL_scriptToInject),
    ],
    server: { middlewareMode: true },
    appType: "custom",
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const apiFallback = async () => {
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
        err ? reject(err) : resolve(apiFallback())
      )
    );
  };
};

export default viteServer;
