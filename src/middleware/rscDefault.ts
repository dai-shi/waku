import path from "node:path";
import { createRequire } from "node:module";
import url from "node:url";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { MiddlewareCreator } from "./common.ts";

const { renderToPipeableStream } = RSDWServer;

RSDWRegister();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const wakuworkServerFname = path.resolve(__dirname, "..", "server.js");

const rscDefault: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
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
    // HACK patch require for wakuwork register
    // FIXME praseFileSync & transformSync would be nice, but encounter:
    code = code.replace(
      '=require("wakuwork/server");',
      `=require("${wakuworkServerFname}");`
    );
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

  const savedJsRequire = (require as any).extensions[".js"];
  (require as any).extensions[".js"] = (m: any, fname: string) => {
    if (fname !== wakuworkServerFname) {
      return savedJsRequire(m, fname);
    }
    let { code } = swc.transformFileSync(fname, {
      jsc: {
        parser: {
          syntax: "ecmascript",
        },
      },
      module: {
        type: "commonjs",
      },
    });
    m._compile(code, fname);
  };
  const { shouldRerender } = require("../server.js");

  const entriesFile = path.resolve(dir, config?.files?.entries || "entries.ts");
  const { getEntry } = require(entriesFile);

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
    const url = new URL(req.url || "", "http://" + req.headers.host);
    const rscId = req.headers["x-react-server-component-id"];
    const rsfId = req.headers["x-react-server-function-id"];
    if (typeof rsfId === "string") {
      const [filePath, name] = rsfId.split("#");
      const fname = path.join(dir, filePath!);
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const args = body ? JSON.parse(body) : [];
      // TODO can we use node:vm?
      const mod = require(fname);
      const data = await (mod[name!] || mod)(...args);
      if (!shouldRerender(data)) {
        renderToPipeableStream(data, bundlerConfig).pipe(res);
        return;
      }
      // continue
    }
    if (typeof rscId === "string") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const props = JSON.parse(body || url.searchParams.get("props") || "{}");
      let component = await getEntry(rscId);
      if (typeof component !== "function") {
        component = component.default;
      }
      renderToPipeableStream(component(props), bundlerConfig).pipe(res);
      return;
    }
    await next();
  };
};

export default rscDefault;
