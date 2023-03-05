import path from "node:path";
import fs from "node:fs";

import type { Middleware } from "../config.js";

const staticFile: Middleware = async (config, req, res, next) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const url = new URL(req.url || "", "http://" + req.headers.host);
  const fname = path.join(dir, url.pathname);
  const stat = fs.statSync(fname, { throwIfNoEntry: false });
  if (stat) {
    res.setHeader("Content-Length", stat.size);
    // FIXME use proper content-type
    res.setHeader("Content-Type", "application/octet-stream");
    fs.createReadStream(fname).pipe(res);
    return;
  }
  await next();
};

export default staticFile;
