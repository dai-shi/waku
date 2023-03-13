import path from "node:path";
import { createRequire } from "node:module";
import url from "node:url";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { MiddlewareCreator } from "./common.ts";

const { renderToPipeableStream } = RSDWServer;

RSDWRegister();

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

  const entriesFile = path.resolve(
    dir,
    config?.files?.entries || "entries.ts"
  );
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
    {
      const id = req.headers["x-react-server-component-id"];
      if (typeof id === "string") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const props = JSON.parse(body || url.searchParams.get("props") || "{}");
        let component = await getEntry(id);
        if (typeof component !== "function") {
          component = component.default;
        }
        renderToPipeableStream(component(props), bundlerConfig).pipe(res);
        return;
      }
    }
    {
      const id = req.headers["x-react-server-function-id"];
      if (typeof id === "string") {
        const [filePath, name] = id.split("#");
        const fname = path.join(dir, filePath!);
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const args = body ? JSON.parse(body) : [];
        // TODO can we use node:vm?
        const mod = require(fname);
        renderToPipeableStream((mod[name!] || mod)(...args), bundlerConfig).pipe(
          res
        );
        return;
      }
    }
    await next();
  };
};

export default rscDefault;
