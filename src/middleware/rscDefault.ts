import path from "node:path";
import Module from "node:module";
import url from "node:url";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { MiddlewareCreator } from "./common.ts";

const { renderToPipeableStream } = RSDWServer;

RSDWRegister();

const rscDefault: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const require = Module.createRequire(import.meta.url);
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
    if (p?.[2] === "server") {
      // HACK to resolve server module id
      url.pathToFileURL = (p: string) =>
        ({ href: "/" + path.relative(dir, p) } as any);
    }
    m._compile(code, fname);
    url.pathToFileURL = savedPathToFileURL;
  };
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, filepath: string) {
        return new Proxy(
          {},
          {
            get(_target, name) {
              return {
                id: "/" + path.relative("file://" + encodeURI(dir), filepath),
                chunks: [],
                name,
                async: true,
              };
            },
          }
        );
      },
    }
  );
  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    const fname = path.join(dir, url.pathname);
    {
      const name = req.headers["x-react-server-component-name"];
      if (typeof name === "string") {
        // TODO can we use node:vm?
        const mod = require(fname);
        const props = Object.fromEntries(url.searchParams.entries());
        renderToPipeableStream((mod[name] || mod)(props), bundlerConfig).pipe(
          res
        );
        return;
      }
    }
    {
      const name = req.headers["x-react-server-function-name"];
      if (typeof name === "string") {
        // TODO can we use node:vm?
        const mod = require(fname);
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const args = body ? JSON.parse(body) : [];
        renderToPipeableStream((mod[name] || mod)(...args), bundlerConfig).pipe(
          res
        );
        return;
      }
    }
    await next();
  };
};

export default rscDefault;
