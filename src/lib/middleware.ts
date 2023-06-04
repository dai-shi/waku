import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as viteCreateServer } from "vite";
import react from "@vitejs/plugin-react";
import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import { configFileConfig, resolveConfig } from "./config.js";
import {
  registerReloadCallback,
  setClientEntries,
  renderRSC,
} from "./rsc-handler.js";
import { rscIndexPlugin } from "./vite-plugin-rsc.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

export function rsc(options: {
  mode: "development" | "production";
}): Middleware {
  const promise =
    options.mode === "production"
      ? setClientEntries("load")
      : Promise.resolve();
  const configPromise = resolveConfig("serve");
  return async (req, res, next) => {
    await promise;
    const config = await configPromise;
    const basePath = config.base + config.framework.rscPrefix;
    const url = new URL(req.url || "", "http://" + req.headers.host);
    let rscId: string | undefined;
    let props = {};
    let rsfId: string | undefined;
    let args: unknown[] = [];
    if (url.pathname.startsWith(basePath)) {
      const index = url.pathname.lastIndexOf("/");
      rscId = url.pathname.slice(basePath.length, index);
      const params = new URLSearchParams(url.pathname.slice(index + 1));
      if (rscId && rscId !== "_") {
        res.setHeader("Content-Type", "text/x-component");
        props = JSON.parse(params.get("props") || "{}");
      } else {
        rscId = undefined;
      }
      rsfId = params.get("action_id") || undefined;
      if (rsfId) {
        if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
          const bb = busboy({ headers: req.headers });
          const reply = decodeReplyFromBusboy(bb);
          req.pipe(bb);
          args = await reply;
        } else {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
          }
          if (body) {
            args = await decodeReply(body);
          }
        }
      }
    }
    if (rscId || rsfId) {
      const pipeable = renderRSC({ rscId, props, rsfId, args });
      pipeable.on("error", (err) => {
        console.info("Cannot render RSC", err);
        res.statusCode = 500;
        if (options.mode === "development") {
          res.end(String(err));
        } else {
          res.end();
        }
      });
      pipeable.pipe(res);
      return;
    }
    next();
  };
}

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
      react(),
      rscIndexPlugin(),
    ],
    server: { middlewareMode: true },
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
    vite.middlewares(req, res, next);
  };
}
