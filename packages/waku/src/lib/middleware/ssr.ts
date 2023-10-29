import path from "node:path";
import fsPromises from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as viteCreateServer } from "vite";
import viteReact from "@vitejs/plugin-react";

import { rscIndexPlugin } from "../vite-plugin/rsc-index-plugin.js";
import { configFileConfig, resolveConfig } from "../config.js";
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
      config.framework.distDir,
      config.framework.publicDir,
      config.framework.indexHtml,
    );
    return fsPromises.readFile(publicIndexHtmlFile, {
      encoding: "utf8",
    });
  });
  let getHtmlStrPromise: Promise<(pathStr: string) => Promise<string>>;
  if (options.command === "start") {
    getHtmlStrPromise = configPromise.then((config) => async (pathStr) => {
      const destFile = path.join(
        config.root,
        config.framework.distDir,
        config.framework.publicDir,
        pathStr,
        pathStr.endsWith("/") ? "index.html" : "",
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
    const vitePromise = configPromise.then((config) =>
      viteCreateServer({
        ...configFileConfig(),
        root: path.join(config.root, config.framework.srcDir),
        plugins: [viteReact(), rscIndexPlugin([])],
        server: { middlewareMode: true },
      }),
    );
    getHtmlStrPromise = vitePromise.then((vite) => async (pathStr) => {
      const result = await vite.transformIndexHtml(
        pathStr,
        await publicIndexHtmlPromise,
      );
      return result;
    });
  }
  return async (req, res, next) => {
    const config = await configPromise;
    const getHtmlStr = await getHtmlStrPromise;
    if (req.url) {
      const handleError = (err: unknown) => {
        if (hasStatusCode(err)) {
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
        const htmlStr = await getHtmlStr(req.url);
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
