import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createServer as viteCreateServer } from "vite";
import viteReact from "@vitejs/plugin-react";

import { configFileConfig, resolveConfig } from "../config.js";
import { registerReloadCallback } from "./rsc/worker-api.js";
import { rscIndexPlugin } from "../vite-plugin/rsc-index-plugin.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

export function devServer(): Middleware {
  const configPromise = resolveConfig("serve");
  const vitePromise = configPromise.then((config) =>
    viteCreateServer({
      ...configFileConfig,
      root: path.join(config.root, config.framework.srcDir),
      optimizeDeps: {
        include: ["react-server-dom-webpack/client"],
        // FIXME without this, waku router has dual module hazard,
        // and "Uncaught Error: Missing Router" happens.
        exclude: ["waku"],
      },
      plugins: [
        // @ts-expect-error This expression is not callable.
        viteReact(),
        rscIndexPlugin(),
      ],
      server: { middlewareMode: true },
    })
  );
  vitePromise.then((vite) => {
    registerReloadCallback((type) => vite.ws.send({ type }));
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    if (req.url?.startsWith("/node_modules/")) {
      // HACK re-export "?v=..." URL to avoid dual module hazard.
      const fname = path.join(vite.config.root, req.url);
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
