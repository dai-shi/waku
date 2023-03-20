import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { createRequire } from "node:module";
import { Writable } from "node:stream";

import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import type { MiddlewareCreator } from "./common.js";
import type { GetEntry, Prefetcher } from "../server.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

// TODO we would like a native solution without hacks
// https://nodejs.org/api/esm.html#loaders
RSDWRegister();

// TODO we have duplicate code here and rscDev.ts

const rscDefault: MiddlewareCreator = (config) => {
  if (!config.prdServer) {
    config.prdServer = {};
  }
  const dir = path.resolve(config.prdServer.dir || ".");
  const basePath = config.build?.basePath || "/"; // FIXME it's not build only
  const require = createRequire(import.meta.url);

  (require as any).extensions[".js"] = (m: any, fname: string) => {
    let code = fs.readFileSync(fname, { encoding: "utf8" });
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
        ({ href: path.relative(dir, p) } as any);
    }
    m._compile(code, fname);
    url.pathToFileURL = savedPathToFileURL;
  };

  const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
  let getEntry: GetEntry | undefined;
  let prefetcher: Prefetcher | undefined;
  let clientEntries: Record<string, string> | undefined;
  try {
    ({ getEntry, prefetcher, clientEntries } = require(entriesFile));
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

  config.prdServer.INTERNAL_scriptToInject = async (path: string) => {
    let code = "";
    if (prefetcher) {
      code += `
globalThis.__WAKUWORK_PREFETCHED__ = {};`;
      const seenIds = new Set<string>();
      await Promise.all(
        [...(await prefetcher(path))].map(async ([rscId, props]) => {
          if (!seenIds.has(rscId)) {
            code += `
globalThis.__WAKUWORK_PREFETCHED__['${rscId}'] = {};`;
            seenIds.add(rscId);
          }
          // FIXME we blindly expect JSON.stringify usage is deterministic
          const serializedProps = JSON.stringify(props);
          const searchParams = new URLSearchParams();
          searchParams.set("rsc_id", rscId);
          searchParams.set("props", serializedProps);
          code += `
globalThis.__WAKUWORK_PREFETCHED__['${rscId}']['${serializedProps}'] = fetch('/?${searchParams}');`;

          // HACK extra rendering without caching FIXME
          const component = await getFunctionComponent(rscId);
          if (!component) {
            return;
          }
          const config = new Proxy(
            {},
            {
              get(_target, id: string) {
                const [filePath, name] = id.split("#");
                if (!clientEntries) {
                  throw new Error("Missing client entries");
                }
                const clientEntry =
                  clientEntries[filePath!] ||
                  clientEntries[filePath!.replace(/\.js$/, ".ts")] ||
                  clientEntries[filePath!.replace(/\.js$/, ".tsx")];
                if (!clientEntry) {
                  throw new Error("No client entry found");
                }
                code += `
import('/${clientEntry}');`;
                return {
                  id: basePath + clientEntry,
                  chunks: [],
                  name,
                  async: true,
                };
              },
            }
          );
          await new Promise<void>((resolve) => {
            const trash = new Writable({
              write(_chunk, _encoding, callback) {
                resolve(); // only wait for the first chunk
                callback();
              },
              final(callback) {
                callback();
              },
            });
            renderToPipeableStream(component(props as {}), config).pipe(trash);
          });
        })
      );
    }
    return code;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, id: string) {
        const [filePath, name] = id.split("#");
        if (!clientEntries) {
          throw new Error("Missing client entries");
        }
        const clientEntry =
          clientEntries[filePath!] ||
          clientEntries[filePath!.replace(/\.js$/, ".ts")] ||
          clientEntries[filePath!.replace(/\.js$/, ".tsx")];
        if (!clientEntry) {
          throw new Error("No client entry found");
        }
        return {
          id: basePath + clientEntry,
          chunks: [],
          name,
          async: true,
        };
      },
    }
  );

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
      const component = await getFunctionComponent(rscId);
      if (component) {
        res.setHeader("Content-Type", "text/x-component");
        renderToPipeableStream(component(props), bundlerConfig).pipe(res);
        return;
      }
      res.statusCode = 404;
      res.end();
    }
    await next();
  };
};

export default rscDefault;
