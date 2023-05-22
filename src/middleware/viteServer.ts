import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { MiddlewareCreator } from "./lib/common.js";
import { codeToInject } from "./lib/rsc-utils.js";
import { registerReloadCallback, setClientEntries } from "./lib/rsc-handler.js";

const rscIndexPlugin = (): Plugin => {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: codeToInject,
          injectTo: "body",
        },
      ];
    },
  };
};

const viteServer: MiddlewareCreator = (config) => {
  const dir = path.resolve(config.devServer?.dir || ".");
  const indexHtml = config.files?.indexHtml || "index.html";
  const indexHtmlFile = path.join(dir, indexHtml);
  const vitePromise = createServer({
    root: dir,
    optimizeDeps: {
      include: ["react-server-dom-webpack/client"],
      // FIXME without this, wakuwork router has dual module hazard,
      // and "Uncaught Error: Missing Router" happens.
      exclude: ["wakuwork"],
    },
    plugins: [
      // @ts-ignore
      react(),
      rscIndexPlugin(),
    ],
    server: { middlewareMode: true },
    appType: "custom",
  });
  vitePromise.then((vite) => {
    registerReloadCallback((type) => vite.ws.send({ type }));
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    const absoluteClientEntries = Object.fromEntries(
      Array.from(vite.moduleGraph.idToModuleMap.values()).map(
        ({ file, url }) => [file, url]
      )
    );
    absoluteClientEntries["*"] = "*"; // HACK to use fallback resolver
    // FIXME this is bad in performance, let's revisit it
    await setClientEntries(absoluteClientEntries);
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
