import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveConfig } from "../config.js";
import { hasStatusCode } from "./rsc/utils.js";
import { renderRSC } from "./rsc/worker-api.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

export function rsc<Context>(options: {
  command: "dev" | "build" | "start";
  unstable_prehook?: (req: IncomingMessage, res: ServerResponse) => Context;
  unstable_posthook?: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: Context,
  ) => void;
}): Middleware {
  if (!options.unstable_prehook && options.unstable_posthook) {
    throw new Error("prehook is required if posthook is provided");
  }
  const configPromise = resolveConfig("serve");
  return async (req, res, next) => {
    const config = await configPromise;
    const basePath = config.base + config.framework.rscPrefix;
    const url = req.url || "";
    if (url.startsWith(basePath)) {
      const { method, headers } = req;
      if (method !== "GET" && method !== "POST") {
        throw new Error(`Unsupported method '${method}'`);
      }
      const handleError = (err: unknown) => {
        if (hasStatusCode(err)) {
          res.statusCode = err.statusCode;
        } else {
          console.info("Cannot render RSC", err);
          res.statusCode = 500;
        }
        if (options.command === "dev") {
          res.end(String(err));
        } else {
          res.end();
        }
      };
      try {
        const context = options.unstable_prehook?.(req, res);
        const [readable, nextCtx] = await renderRSC({
          pathStr: url.slice(basePath.length),
          method,
          headers,
          command: options.command,
          stream: req,
          context,
        });
        options.unstable_posthook?.(req, res, nextCtx as Context);
        readable.on("error", handleError);
        readable.pipe(res);
      } catch (e) {
        handleError(e);
      }
      return;
    }
    next();
  };
}
