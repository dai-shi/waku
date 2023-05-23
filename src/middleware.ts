import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createServer } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

import type { FrameworkConfig } from "./config.js";
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

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

export function rsc(options: {
  mode: "development" | "production";
}): Middleware {
  if (options.mode === "production") {
    throw new Error("under construction");
  }
  // TODO make them configurable
  const vitePromise = createServer({
    ...(process.env.CONFIG_FILE && { configFile: process.env.CONFIG_FILE }),
    optimizeDeps: {
      include: ["react-server-dom-webpack/client"],
      // FIXME without this, waku router has dual module hazard,
      // and "Uncaught Error: Missing Router" happens.
      exclude: ["waku"],
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
  return (req, res, next) => {
    // TODO this should be improved...
    (async () => {
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
          const { framework: frameworkConfig } = vite.config as {
            framework?: FrameworkConfig;
          };
          const fname = path.join(
            vite.config.root,
            frameworkConfig?.indexHtml || "index.html"
          );
          if (fs.existsSync(fname)) {
            let content = await fsPromises.readFile(fname, {
              encoding: "utf-8",
            });
            content = await vite.transformIndexHtml(req.url || "", content);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(content);
            return;
          }
          res.statusCode = 404;
          res.end();
          return;
        }
        next();
      };
      vite.middlewares(req, res, indexFallback);
    })();
  };
}
