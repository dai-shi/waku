import path from "node:path";
import { createRequire } from "node:module";
import url from "node:url";
import { Writable } from "node:stream";
import Module from "node:module";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prerenderer } from "../server.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

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

const rscDefault: MiddlewareCreator = (config) => {
  if (!config.devServer) {
    config.devServer = {};
  }
  const dir = path.resolve(config.devServer.dir || ".");
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
      // HACK to resolve module id
      url.pathToFileURL = (p: string) =>
        ({ href: "/" + path.relative(dir, p) } as any);
    }
    m._compile(code, fname);
    url.pathToFileURL = savedPathToFileURL;
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

  const entriesFile = path.resolve(dir, config.files?.entries || "entries.js");
  let getEntry: GetEntry | undefined;
  let prerenderer: Prerenderer | undefined;
  try {
    ({ getEntry, prerenderer } = require(entriesFile));
  } catch (e) {
    console.info(`No entries file found at ${entriesFile}, ignoring...`, e);
  }

  const getFunctionComponent =
    getEntry &&
    (async (id: string) => {
      const mod = await getEntry!(id);
      if (typeof mod === "function") {
        return mod;
      }
      return mod.default;
    });

  config.devServer.INTERNAL_scriptToInject = async (path: string) => {
    type Id = string;
    type SerializedProps = string;
    type DataURL = string;
    const prerendered: Record<Id, Record<SerializedProps, DataURL>> = {};
    if (getFunctionComponent && prerenderer) {
      await Promise.all(
        [...(await prerenderer(path))].map(async ([id, props]) => {
          // FIXME we blindly expect JSON.stringify usage is deterministic
          const serializedProps = JSON.stringify(props);
          const component = await getFunctionComponent(id);
          if (!prerendered[id]) {
            prerendered[id] = {};
          }
          return new Promise<void>((resolve) => {
            const chunks: Uint8Array[] = [];
            const writable = new Writable({
              write(chunk, _encoding, callback) {
                chunks.push(chunk);
                callback();
              },
              final(callback) {
                const buf = Buffer.concat(chunks);
                prerendered[id]![serializedProps] =
                  "data:text/x-component;base64," + buf.toString("base64");
                resolve();
                callback();
              },
            });
            renderToPipeableStream(component(props as {}), bundlerConfig).pipe(
              writable
            );
          });
        })
      );
    }
    return (
      `
globalThis.__webpack_require__ = function (id) {
  return import(id);
};
` +
      (Object.keys(prerendered).length
        ? `
globalThis.__WAKUWORK_PRERENDERED__ = ${JSON.stringify(prerendered)};
`
        : "")
    );
  };

  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
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
        body || url.searchParams.get("props") || "{}"
      );
      const component = getFunctionComponent
        ? await getFunctionComponent(rscId)
        : () => null;
      res.setHeader("Content-Type", "text/x-component");
      renderToPipeableStream(component(props), bundlerConfig).pipe(res);
      return;
    }
    await next();
  };
};

export default rscDefault;
