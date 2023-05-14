import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { MiddlewareCreator } from "./lib/common.js";

import { renderRSC, prefetcherRSC } from "./lib/rsc-handler.js";

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

const rscDev: MiddlewareCreator = (_config, shared) => {
  shared.devScriptToInject = async (pathItem: string) => {
    const code =
      `
globalThis.__wakuwork_module_cache__ = new Map();
globalThis.__webpack_chunk_load__ = async (id) => id.startsWith("wakuwork/") || import(id).then((m) => globalThis.__wakuwork_module_cache__.set(id, m));
globalThis.__webpack_require__ = (id) => globalThis.__wakuwork_module_cache__.get(id);` +
      (await prefetcherRSC(pathItem));
    return code;
  };

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (Array.isArray(rscId) || Array.isArray(rsfId)) {
      throw new Error("rscId and rsfId should not be array");
    }
    let props = {};
    if (rscId) {
      res.setHeader("Content-Type", "text/x-component");
      props = JSON.parse(
        (req.headers["x-react-server-component-props"] as string | undefined) ||
          "{}"
      );
    }
    let args: unknown[] = [];
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
    if (rscId || rsfId) {
      renderRSC({ rscId, props, rsfId, args }).pipe(res);
      return;
    }
    await next();
  };
};

export default rscDev;
