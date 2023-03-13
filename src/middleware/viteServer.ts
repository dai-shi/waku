import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import url from "node:url";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { MiddlewareCreator } from "./common.ts";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// This actually belongs to the rscDefault middleware.
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

const viteServer: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const indexHtmlFile = path.resolve(
    dir,
    config?.files?.indexHtml || "index.html"
  );
  const vitePromise = createServer({
    root: dir,
    resolve: {
      alias: {
        "wakuwork/client": path.resolve(__dirname, "..", "client.js")
      },
    },
    plugins: [react(), rscPlugin(dir)],
    server: { middlewareMode: true },
    appType: "custom",
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const url = new URL(req.url || "", "http://" + req.headers.host);
    if (url.pathname === "/") {
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
    return new Promise((resolve, reject) =>
      vite.middlewares(req, res, (err: unknown) =>
        err ? reject(err) : resolve(next())
      )
    );
  };
};

export default viteServer;
