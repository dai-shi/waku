import path from "node:path";

import RSDWServer from "react-server-dom-webpack/server.node.unbundled";
import busboy from "busboy";

import type { MiddlewareCreator } from "./lib/common.js";
import type { Prefetcher } from "../server.js";
import { generatePrefetchCode } from "./lib/rsc-utils.js";
import { renderRSC } from "./lib/rsc-renderer.js";

const { decodeReply, decodeReplyFromBusboy } = RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

// TODO we have duplicate code here and rsc-renderer-worker.ts

const rscPrd: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.prdServer?.dir || ".");
  const basePath = config.build?.basePath || "/"; // FIXME it's not build only

  const entriesFile =
    (process.platform === "win32" ? "file://" : "") +
    path.join(dir, config.files?.entriesJs || "entries.js");
  const prefetcher: Prefetcher = async (pathItem) => {
    const mod = await import(entriesFile);
    return mod?.prefetcher(pathItem) ?? {};
  };
  let clientEntries: Record<string, string> | undefined;
  import(entriesFile).then((mod) => {
    clientEntries = mod.clientEntries;
  });

  const getClientEntry = (id: string) => {
    if (!clientEntries) {
      throw new Error("Missing client entries");
    }
    const clientEntry =
      clientEntries[id] ||
      clientEntries[id.replace(/\.js$/, ".ts")] ||
      clientEntries[id.replace(/\.js$/, ".tsx")] ||
      clientEntries[id.replace(/\.js$/, ".jsx")];
    if (!clientEntry) {
      throw new Error("No client entry found");
    }
    return clientEntry;
  };

  const decodeId = (encodedId: string): [id: string, name: string] => {
    let [id, name] = encodedId.split("#") as [string, string];
    if (!id.startsWith("wakuwork/")) {
      id = path.relative("file://" + encodeURI(dir), id);
      id = basePath + getClientEntry(decodeURI(id));
    }
    return [id, name];
  };

  shared.prdScriptToInject = async (path: string) => {
    let code = "";
    if (prefetcher) {
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
    }
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
      renderRSC(
        { rscId, props, rsfId, args },
        { loadClientEntries: true, loadServerEntries: true }
      ).pipe(res);
      return;
    }
    await next();
  };
};

export default rscPrd;
