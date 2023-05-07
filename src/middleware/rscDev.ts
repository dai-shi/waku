import path from "node:path";

import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prefetcher } from "../server.js";
import { transformRsfId } from "./rewriteRsc.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

const rscDev: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.devServer?.dir || ".");

  const entriesFile = (process.platform === 'win32' ? 'file://' : '') + path.join(dir, config.files?.entriesJs || "entries.js");
  const getEntry: GetEntry = async (rscId) => {
    const mod = await import(entriesFile);
    return mod.getEntry(rscId);
  };
  const prefetcher: Prefetcher = async (pathItem) => {
    const mod = await import(entriesFile);
    return mod?.prefetcher(pathItem) ?? {};
  };

  const getFunctionComponent = async (rscId: string) => {
    const mod = await getEntry(rscId);
    if (typeof mod === "function") {
      return mod;
    }
    return mod.default;
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
    code += shared.generatePrefetchCode?.(entryItems, moduleIds) || "";
    return code;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [id, name] = decodeId(encodedId);
        return { id, chunks: [id], name, async: true };
      },
    }
  );

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (typeof rsfId === "string") {
      const [filePath, name] = rsfId.split("#");
      const fname = path.join(dir, filePath!);
      let args: unknown[] = [];
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
      const mod = await import(fname);
      const data = await (mod[name!] || mod)(...args);
      if (typeof rscId !== "string") {
        res.setHeader("Content-Type", "text/x-component");
        renderToPipeableStream(data, bundlerConfig).pipe(res);
        return;
      }
      // continue for mutation mode
    }
    if (typeof rscId === "string") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const props: {} = JSON.parse(
        body ||
          (req.headers["x-react-server-component-props"] as
            | string
            | undefined) ||
          "{}"
      );
      const component = await getFunctionComponent(rscId);
      if (component) {
        res.setHeader("Content-Type", "text/x-component");
        renderToPipeableStream(createElement(component, props), bundlerConfig)
          .pipe(transformRsfId("file://" + encodeURI(dir)))
          .pipe(res);
        return;
      }
      res.statusCode = 404;
      res.end();
    }
    await next();
  };
};

export default rscDev;
