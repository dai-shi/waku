import path from "node:path";

import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { MiddlewareCreator } from "./lib/common.js";
import type { Prefetcher } from "../server.js";
import { generatePrefetchCode } from "./lib/rsc-utils.js";

import { renderRSC } from "./lib/rsc-renderer.js";

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

const rscDev: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.devServer?.dir || ".");

  const entriesFile =
    (process.platform === "win32" ? "file://" : "") +
    path.join(dir, config.files?.entriesJs || "entries.js");
  const prefetcher: Prefetcher = async (pathItem) => {
    const mod = await import(entriesFile);
    return mod?.prefetcher(pathItem) ?? {};
  };

  const decodeId = (encodedId: string): [id: string, name: string] => {
    let [id, name] = encodedId.split("#") as [string, string];
    if (!id.startsWith("wakuwork/")) {
      id = path.relative("file://" + encodeURI(dir), id);
      id = "/" + decodeURI(id);
    }
    return [id, name];
  };

  shared.devScriptToInject = async (path: string) => {
    let code = `
globalThis.__wakuwork_module_cache__ = new Map();
globalThis.__webpack_chunk_load__ = async (id) => id.startsWith("wakuwork/") || import(id).then((m) => globalThis.__wakuwork_module_cache__.set(id, m));
globalThis.__webpack_require__ = (id) => globalThis.__wakuwork_module_cache__.get(id);
`;
    const { entryItems = [], clientModules = [] } = await prefetcher(path);
    const moduleIds: string[] = [];
    for (const m of clientModules as any[]) {
      if (m["$$typeof"] !== CLIENT_REFERENCE) {
        throw new Error("clientModules must be client references");
      }
      const [id] = decodeId(m["$$id"]);
      moduleIds.push(id);
    }
    code += generatePrefetchCode?.(entryItems, moduleIds) || "";
    return code;
  };

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (Array.isArray(rscId) || Array.isArray(rsfId)) {
      throw new Error('rscId and rsfId should not be array')
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
