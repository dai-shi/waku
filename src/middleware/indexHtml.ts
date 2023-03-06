import path from "node:path";
import fs from "node:fs";

import type { MiddlewareCreator } from "./common.ts";

const indexHtml: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    if (url.pathname === "/") {
      const fname = path.join(dir, "index.html");
      const stat = fs.statSync(fname, { throwIfNoEntry: false });
      if (stat) {
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        fs.createReadStream(fname).pipe(res);
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }
    await next();
  };
};

export default indexHtml;
