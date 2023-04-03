import path from "node:path";

import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prefetcher } from "../server.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

const rscDev: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.devServer?.dir || ".");

  const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
  const getEntry: GetEntry = async (rscId) => {
    const mod = await import(entriesFile);
    return mod.getEntry(rscId);
  };
  const prefetcher: Prefetcher = async (pathItem) => {
    const mod = await import(entriesFile);
    return mod.prefetcher(pathItem);
  };

  const getFunctionComponent = async (rscId: string) => {
    const mod = await getEntry(rscId);
    if (typeof mod === "function") {
      return mod;
    }
    return mod.default;
  };

  const decodeId = (id: string) => {
    if (id.startsWith("wakuwork/")) {
      return id;
    }
    const filePath = path.relative("file://" + encodeURI(dir), id);
    return "/" + decodeURI(filePath);
  };

  shared.devScriptToInject = async (path: string) => {
    let code = `
globalThis.__webpack_require__ = (id) => {
  const cache = globalThis.__webpack_require__wakuwork_cache;
  if (cache && cache.has(id)) return cache.get(id);
  return import(id);
};`;
    const { entryItems = [], clientModules = [] } = await prefetcher(path);
    const moduleIds: string[] = [];
    for (const m of clientModules as any[]) {
      if (m["$$typeof"] !== CLIENT_REFERENCE) {
        throw new Error("clientModules must be client references");
      }
      const [filePath] = decodeId(m["$$id"]).split("#");
      moduleIds.push(filePath!);
    }
    code += shared.generatePrefetchCode?.(entryItems, moduleIds) || "";
    return code;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, id: string) {
        const [filePath, name] = decodeId(id).split("#");
        return {
          id: filePath,
          chunks: [],
          name,
          async: true,
        };
      },
    }
  );

  return async (req, res, next) => {
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (typeof rsfId === "string") {
      // FIXME We should not send the URL (with full path) to the client.
      // This should be fixed. Not for production use.
      // https://github.com/facebook/react/blob/93c10dfa6b0848c12189b773b59c77d74cad2a1a/packages/react-server-dom-webpack/src/ReactFlightClientNodeBundlerConfig.js#L47
      const [filePath, name] = decodeId(rsfId).split("#");
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
        renderToPipeableStream(
          createElement(component, props),
          bundlerConfig
        ).pipe(res);
        return;
      }
      res.statusCode = 404;
      res.end();
    }
    await next();
  };
};

export default rscDev;
