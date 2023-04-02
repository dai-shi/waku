import path from "node:path";
import url from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";

import * as swc from "@swc/core";
import { createElement } from "react";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prefetcher } from "../server.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

// TODO we would like a native solution without hacks
// https://nodejs.org/api/esm.html#loaders
RSDWRegister();

// HACK to read .ts/.tsx files with .js extension
const savedResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = (fname: string, m: any) => {
  if (fname.endsWith(".js")) {
    for (const ext of [".js", ".ts", ".tsx"]) {
      try {
        return savedResolveFilename(fname.slice(0, -3) + ext, m);
      } catch (e) {
        // ignored
      }
    }
  }
  return savedResolveFilename(fname, m);
};

const rscDefault: MiddlewareCreator = (config, shared) => {
  const dir = path.resolve(config.devServer?.dir || ".");
  const require = createRequire(import.meta.url);

  (require as any).extensions[".ts"] = (require as any).extensions[".tsx"] = (
    m: any,
    fname: string
  ) => {
    let { code } = swc.transformFileSync(fname, {
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: fname.endsWith(".tsx"),
        },
        transform: {
          react: {
            runtime: "automatic",
          },
        },
      },
      module: {
        type: "commonjs",
      },
    });
    // HACK to pull directive to the root
    // FIXME praseFileSync & transformSync would be nice, but encounter:
    // https://github.com/swc-project/swc/issues/6255
    const p = code.match(/(?:^|\n|;)("use (client|server)";)/);
    if (p) {
      code = p[1] + code;
    }
    const savedPathToFileURL = url.pathToFileURL;
    if (p) {
      // HACK to resolve rscId
      url.pathToFileURL = (p: string) =>
        ({ href: "/" + path.relative(dir, p) } as any);
    }
    m._compile(code, fname);
    url.pathToFileURL = savedPathToFileURL;
  };

  const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
  let getEntry: GetEntry | undefined;
  let prefetcher: Prefetcher | undefined;
  try {
    ({ getEntry, prefetcher } = require(entriesFile));
  } catch (e) {
    console.info(`No entries file found at ${entriesFile}, ignoring...`, e);
  }

  const getFunctionComponent = async (rscId: string) => {
    if (!getEntry) {
      return null;
    }
    const mod = await getEntry(rscId);
    if (typeof mod === "function") {
      return mod;
    }
    return mod.default;
  };

  shared.devScriptToInject = async (path: string) => {
    let code = `
globalThis.__webpack_require__ = (id) => {
  const cache = globalThis.__webpack_require__wakuwork_cache;
  if (cache && cache.has(id)) return cache.get(id);
  return import(id);
};`;
    if (prefetcher) {
      const { entryItems = [], clientModules = [] } = await prefetcher(path);
      const moduleIds: string[] = [];
      for (const m of clientModules as any[]) {
        if (m["$$typeof"] !== CLIENT_REFERENCE) {
          throw new Error("clientModules must be client references");
        }
        const [filePath] = m["$$id"].split("#");
        moduleIds.push(filePath);
      }
      code += shared.generatePrefetchCode?.(entryItems, moduleIds) || "";
    }
    return code;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, id: string) {
        const [filePath, name] = id.split("#");
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
      const mod = require(fname);
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

export default rscDefault;
