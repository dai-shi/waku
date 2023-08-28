import type { IncomingMessage, ServerResponse } from "node:http";
import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import { resolveConfig } from "../config.js";
import { hasStatusCode } from "./rsc/utils.js";
import { renderRSC } from "./rsc/worker-api.js";

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

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
    const url = new URL(req.url || "", "http://" + req.headers.host);
    let rscId: string | undefined;
    let props = {};
    let rsfId: string | undefined;
    let args: unknown[] = [];
    if (url.pathname.startsWith(basePath)) {
      const index = url.pathname.lastIndexOf("/");
      rscId = url.pathname.slice(basePath.length, index);
      const params = new URLSearchParams(url.pathname.slice(index + 1));
      if (rscId && rscId !== "_") {
        res.setHeader("Content-Type", "text/x-component");
        props = JSON.parse(params.get("props") || "{}");
      } else {
        rscId = undefined;
      }
      rsfId = params.get("action_id") || undefined;
      if (rsfId) {
        if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
          const bb = busboy({ headers: req.headers });
          const reply = decodeReplyFromBusboy(bb);
          req.pipe(bb);
          args = await reply;
        } else {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
          }
          if (body) {
            args = await decodeReply(body);
          }
        }
      }
    }
    if (rscId || rsfId) {
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
        const ctx = options.unstable_prehook?.(req, res);
        const [readable, nextCtx] = await renderRSC(
          rsfId
            ? rscId
              ? { rsfId, args, rscId, props }
              : { rsfId, args }
            : { rscId: rscId as string, props },
          { command: options.command, ctx },
        );
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
