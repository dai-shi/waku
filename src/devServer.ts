import http from "node:http";

import type { Config } from "./config";
import { pipe } from "./middleware/common.js";
import { indexHtml } from "./middleware/indexHtml.js";
import { rscDefault } from "./middleware/rscDefault.js";
import { tsFile } from "./middleware/tsFile.js";
import { staticFile } from "./middleware/staticFile.js";
import { notFound } from "./middleware/notFound.js";

export function startDevServer(config: Config = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      await pipe([indexHtml, rscDefault, tsFile, staticFile, notFound])(
        config,
        req,
        res,
        async () => {}
      );
      return;
    } catch (e) {
      console.info(e);
    }
    res.statusCode = 500;
    res.end();
  });

  server.listen(config?.devServer?.port ?? 3000);
}
