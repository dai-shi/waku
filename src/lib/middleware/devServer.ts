import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as viteCreateServer } from "vite";
import viteReact from "@vitejs/plugin-react";

import { configFileConfig } from "../config.js";
import { registerReloadCallback } from "./rsc/worker-api.js";
import { rscIndexPlugin } from "../vite-plugin/rsc-index-plugin.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

export function devServer(): Middleware {
  const vitePromise = viteCreateServer({
    ...configFileConfig,
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
  });
  vitePromise.then((vite) => {
    registerReloadCallback((type) => vite.ws.send({ type }));
  });
  return async (req, res, next) => {
    const vite = await vitePromise;
    vite.middlewares(req, res, next);
  };
}
