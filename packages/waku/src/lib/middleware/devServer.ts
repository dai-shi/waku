import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createServer as viteCreateServer } from "vite";
import viteReact from "@vitejs/plugin-react";

import { configFileConfig, resolveConfig } from "../config.js";
import {
  registerReloadCallback,
  registerImportCallback,
} from "./rsc/worker-api.js";
import { rscIndexPlugin } from "../vite-plugin/rsc-index-plugin.js";
import { rscHmrPlugin, hotImport } from "../vite-plugin/rsc-hmr-plugin.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

export function devServer(): Middleware {
  const configPromise = resolveConfig("serve");
  const vitePromise = configPromise.then((config) =>
    viteCreateServer({
      ...configFileConfig(),
      root: path.join(config.root, config.framework.srcDir),
      optimizeDeps: {
        include: ["react-server-dom-webpack/client"],
        // FIXME without this, waku router has dual module hazard,
        // and "Uncaught Error: Missing Router" happens.
        exclude: ["waku"],
      },
      plugins: [viteReact(), rscIndexPlugin([]), rscHmrPlugin()],
      server: { middlewareMode: true },
    }),
  );
  vitePromise.then((vite) => {
    registerReloadCallback((type) => vite.ws.send({ type }));
    registerImportCallback((source) => hotImport(vite, source));
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    if (req.url) {
      // HACK re-export "?v=..." URL to avoid dual module hazard.
      const fname = req.url.startsWith("/@fs/")
        ? req.url.slice(4)
        : path.join(vite.config.root, req.url);
      for (const item of vite.moduleGraph.idToModuleMap.values()) {
        if (item.file === fname && item.url !== req.url) {
          res.setHeader("Content-Type", "application/javascript");
          res.statusCode = 200;
          res.end(`export * from "${item.url}";`, "utf8");
          return;
        }
      }
    }
    vite.middlewares(req, res, next);
  };
}
