import path from "node:path";
import fsPromises from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveConfig } from "../config.js";
import { renderHtml } from "./ssr/utils.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === "number";

export function ssr(options: {
  command: "dev" | "build" | "start";
}): Middleware {
  const configPromise = resolveConfig("serve");
  const publicIndexHtmlPromise = configPromise.then((config) => {
    const publicIndexHtmlFile = path.join(
      config.root,
      options.command === "dev"
        ? config.framework.srcDir
        : path.join(config.framework.distDir, config.framework.publicDir),
      config.framework.indexHtml,
    );
    return fsPromises.readFile(publicIndexHtmlFile, {
      encoding: "utf8",
    });
  });
  let getHtmlStrPromise: Promise<
    (req: IncomingMessage & { url: string }) => Promise<string>
  >;
  if (options.command === "start") {
    getHtmlStrPromise = configPromise.then((config) => async (req) => {
      const destFile = path.join(
        config.root,
        config.framework.distDir,
        config.framework.publicDir,
        req.url,
        req.url.endsWith("/") ? "index.html" : "",
      );
      let htmlStr: string;
      try {
        htmlStr = await fsPromises.readFile(destFile, { encoding: "utf8" });
      } catch (e) {
        htmlStr = await publicIndexHtmlPromise;
      }
      return htmlStr;
    });
  } else {
    getHtmlStrPromise = configPromise.then((config) => async (req) => {
      const rscServer = new URL(
        config.framework.ssr.rscServer,
        "http://" + req.headers.host,
      );
      const htmlRes = await fetch(rscServer + req.url.slice(1), {
        headers: { "x-waku-ssr-mode": "html" },
      });
      if (!htmlRes.ok) {
        const err = new Error("Failed to fetch html from RSC server");
        (err as any).statusCode = htmlRes.status;
        throw err;
      }
      if (!htmlRes.body) {
        throw new Error("No body");
      }
      return htmlRes.text();
    });
  }
  return async (req, res, next) => {
    const config = await configPromise;
    const getHtmlStr = await getHtmlStrPromise;
    if (req.url && !req.headers["x-waku-ssr-mode"]) {
      const handleError = (err: unknown) => {
        if (hasStatusCode(err)) {
          if (err.statusCode === 404) {
            next();
            return;
          }
          res.statusCode = err.statusCode;
        } else {
          console.info("Cannot render HTML", err);
          res.statusCode = 500;
        }
        if (options.command === "dev") {
          res.end(String(err));
        } else {
          res.end();
        }
      };
      try {
        const htmlStr = await getHtmlStr(req as typeof req & { url: string });
        const readable = await renderHtml(
          config,
          options.command,
          req.url,
          htmlStr,
        );
        if (readable) {
          readable.on("error", handleError);
          readable.pipe(res);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    next();
  };
}
