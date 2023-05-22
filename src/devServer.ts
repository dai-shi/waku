import http from "node:http";

import type { Config, Middleware } from "./config.js";
import { pipe } from "./middleware/lib/common.js";

export function startDevServer(config: Config = {}) {
  const middlewares = config.devServer?.middlewares || [
    "rewriteRsc",
    "rscDev",
    "viteServer",
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
  const port = config.devServer?.port ?? 3000;
  server.listen(port, () => {
    console.info("Listening on", port);
  });
}
