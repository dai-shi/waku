import path from "node:path";
import fs from "node:fs";

import type { MiddlewareCreator } from "./lib/common.js";

const staticFile: MiddlewareCreator = (config) => {
  const dir = path.resolve(config.prdServer?.dir || ".");
  const publicPath = config.files?.public || "public";
  const indexHtml = config.files?.indexHtml || "index.html";
  const indexHtmlFile = path.join(dir, publicPath, indexHtml);
  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    // TODO make it configurable?
    const hasExtension = url.pathname.split(".").length > 1;
    if (!hasExtension) {
      const stat = fs.statSync(indexHtmlFile, { throwIfNoEntry: false });
      if (stat) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Length", stat.size);
        fs.createReadStream(indexHtmlFile).pipe(res);
        return;
      }
    }
    await next();
  };
};

export default staticFile;
