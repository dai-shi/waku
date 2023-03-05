import http from "node:http";

import type { Config } from "./config";
import { pipe } from "./middleware/common.js";

export function startDevServer(config: Config = {}) {
  const middlewares = config?.devServer?.middlewares || [
    "indexHtml",
    "rscDefault",
    "tsFile",
    "staticFile",
    "notFound",
  ];
  const handler = pipe(
    middlewares.map((middleware) => {
      if (typeof middleware === "string") {
        return async (config, req, res, next) => {
          const mod = await import(`./middleware/${middleware}.js`);
          await (mod.default || mod)(config, req, res, next);
        };
      }
      return middleware;
    })
  );
  const server = http.createServer(async (req, res) => {
    try {
      await handler(config, req, res, async () => {});
      return;
    } catch (e) {
      console.info(e);
    }
    res.statusCode = 500;
    res.end();
  });
  server.listen(config?.devServer?.port ?? 3000);
}
