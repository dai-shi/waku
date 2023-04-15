import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";

import type { MiddlewareCreator } from "./common.js";

const staticFile: MiddlewareCreator = (config, shared) => {
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
        const code = await shared.prdScriptToInject?.(req.url || "");
        if (code) {
          let data = await fsPromises.readFile(indexHtmlFile, {
            encoding: "utf-8",
          });
          const scriptToInject = `<script>${code}</script>`;
          if (!data.includes(scriptToInject)) {
            data = data.replace(/<\/body>/, `${scriptToInject}</body>`);
          }
          res.end(data);
          return;
        }
        res.setHeader("Content-Length", stat.size);
        fs.createReadStream(indexHtmlFile).pipe(res);
        return;
      }
    }
    await next();
  };
};

export default staticFile;
