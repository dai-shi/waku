import http from "node:http";

import type { Config, Middleware } from "./config.js";
import { pipe } from "./middleware/lib/common.js";

export function startPrdServer(config: Config = {}) {
  const middlewares = config.prdServer?.middlewares || [
    "staticFile",
    "rewriteRsc",
    "rscPrd",
    "indexFallback",
    "notFound",
  ];
  const resolvedMiddlewares = Promise.all<Middleware>(
    middlewares.map(async (middleware) => {
      if (typeof middleware === "string") {
        const mod = await import(`./middleware/${middleware}.js`);
        return (mod.default || mod)(config);
      }
      return middleware;
    })
  );
  const server = http.createServer(async (req, res) => {
    try {
      await pipe(await resolvedMiddlewares)(req, res, async () => {});
      return;
    } catch (e) {
      console.info(e);
    }
    res.statusCode = 500;
    res.end();
  });
  const port = config.prdServer?.port ?? 8080;
  server.listen(port, () => {
    console.info("Listening on", port);
  });
}
