import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { MiddlewareCreator } from "./lib/common.js";
import { renderRSC, setClientEntries } from "./lib/rsc-handler.js";

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

// FIXME we have duplicate code here and rscDev.ts

const rscPrd: MiddlewareCreator = () => {
  const promise = setClientEntries("load");
  return async (req, res, next) => {
    await promise;
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
      const pipeable = renderRSC({ rscId, props, rsfId, args });
      pipeable.on("error", (err) => {
        console.info("Cannot render RSC", err);
        res.statusCode = 500;
        res.end();
      });
      pipeable.pipe(res);
      return;
    }
    await next();
  };
};

export default rscPrd;
