import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { MiddlewareCreator } from "./common.ts";

const codeToInject = `
globalThis.__webpack_require__ = function (id) {
  return import(/* @vite-ignore */ id);
};
`;

const rscPlugin = (dir: string): Plugin => {
  return {
    name: "rscPlugin",
    transform(src, id) {
      const relativePath = path.relative(dir, id);
      if (
        !relativePath.startsWith("node_modules/") &&
        (relativePath.endsWith(".ts") || relativePath.endsWith(".tsx"))
      ) {
        return src + codeToInject;
      }
      return src;
    },
  };
};

const tsFile: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const vitePromise = createServer({
    root: dir,
    plugins: [react(), rscPlugin(dir)],
    server: { middlewareMode: true },
    appType: "custom",
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const url = new URL(req.url || "", "http://" + req.headers.host);
    if (url.pathname === "/") {
      const fname = path.join(dir, "index.html");
      if (fs.existsSync(fname)) {
        let data = await fsPromises.readFile(fname, { encoding: "utf-8" });
        data = await vite.transformIndexHtml(req.url || "", data);
        res.setHeader("Content-Length", data.length);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(data);
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }
    return new Promise((resolve, reject) => {
      vite.middlewares(req, res, (err: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(next());
        }
      });
    });
  };
};

export default tsFile;
