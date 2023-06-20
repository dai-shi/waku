import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";

import { createServer as viteCreateServer } from "vite";

import { configFileConfig, resolveConfig } from "../config.js";
import { defineEntries } from "../../server.js";
import type { GetSsrConfig } from "../../server.js";
import { nonjsResolvePlugin } from "../vite-plugin/nonjs-resolve-plugin.js";
import { renderHtmlToReadable } from "./ssr/utils.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

type Entries = { default: ReturnType<typeof defineEntries> };

const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === "number";

const renderHTML = async (
  pathStr: string,
  rscServer: URL,
  config: Awaited<ReturnType<typeof resolveConfig>>,
  ssrConfig: NonNullable<Awaited<ReturnType<GetSsrConfig>>>
) => {
  const rscPrefix = config.framework.rscPrefix;
  const { splitHTML, getFallback } = config.framework.ssr;
  const htmlResPromise = fetch(rscServer + pathStr.slice(1), {
    headers: { "x-waku-ssr-mode": "html" },
  });
  const [rscId, props] = ssrConfig.element;
  // FIXME we blindly expect JSON.stringify usage is deterministic
  const serializedProps = JSON.stringify(props);
  const searchParams = new URLSearchParams();
  searchParams.set("props", serializedProps);
  const rscResPromise = fetch(
    rscServer + rscPrefix + rscId + "/" + searchParams,
    {
      headers: { "x-waku-ssr-mode": "rsc" },
    }
  );
  const [htmlRes, rscRes] = await Promise.all([htmlResPromise, rscResPromise]);
  if (!htmlRes.ok) {
    const err = new Error("Failed to fetch html from RSC server");
    (err as any).statusCode = htmlRes.status;
    throw err;
  }
  if (!rscRes.ok) {
    const err = new Error("Failed to fetch rsc from RSC server");
    (err as any).statusCode = rscRes.status;
    throw err;
  }
  if (!htmlRes.body || !rscRes.body) {
    throw new Error("No body");
  }
  return renderHtmlToReadable(
    await htmlRes.text(),
    Readable.fromWeb(rscRes.body as any), // FIXME how to avoid any?
    splitHTML,
    getFallback
  );
};

// Important note about the middleware design:
// - We assume and support using ssr and rsc middleware on different machines.
export function ssr(options: {
  mode: "development" | "production";
}): Middleware {
  const configPromise = resolveConfig("serve");
  const vitePromise = viteCreateServer({
    ...configFileConfig,
    plugins: [
      ...(options.mode === "development" ? [nonjsResolvePlugin()] : []),
    ],
    appType: "custom",
  });
  const getSsrConfigPromise = vitePromise.then(async (vite) => {
    const config = await configPromise;
    const entriesFile = path.join(config.root, config.framework.entriesJs);
    const {
      default: { getSsrConfig },
    } = await (vite.ssrLoadModule(entriesFile) as Promise<Entries>);
    return getSsrConfig;
  });
  return async (req, res, next) => {
    const [config, getSsrConfig] = await Promise.all([
      configPromise,
      getSsrConfigPromise,
    ]);
    if (req.url && !req.headers["x-waku-ssr-mode"]) {
      const ssrConfig = getSsrConfig && (await getSsrConfig(req.url));
      if (ssrConfig) {
        const rscServer = new URL(
          config.framework.ssr.rscServer,
          "http://" + req.headers.host
        );
        const handleError = (err: unknown) => {
          if (hasStatusCode(err)) {
            res.statusCode = err.statusCode;
          } else {
            console.info("Cannot render HTML", err);
            res.statusCode = 500;
          }
          if (options.mode === "development") {
            res.end(String(err));
          } else {
            res.end();
          }
        };
        try {
          const readable = await renderHTML(
            req.url,
            rscServer,
            config,
            ssrConfig
          );
          readable.on("error", handleError);
          readable.pipe(res);
        } catch (e) {
          handleError(e);
        }
        return;
      }
    }
    next();
  };
}
