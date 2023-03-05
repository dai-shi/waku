import path from "node:path";
import Module from "node:module";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { Middleware } from "../config.js";

const { renderToPipeableStream } = RSDWServer;
const require = Module.createRequire(import.meta.url);
const extensions = [".ts", ".tsx"];

RSDWRegister();

const transpileTypeScript = (m: any, fname: string) => {
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
  const p = code.match(/(?:^|\n|;)("use (?:client|server)";)/);
  if (p) {
    code = p[1] + code;
  }
  return m._compile(code, fname);
};

extensions.forEach((ext) => {
  (Module as any)._extensions[ext] = transpileTypeScript;
});

const rscDefault: Middleware = async (config, req, res, next) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
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
  const url = new URL(req.url || "", "http://" + req.headers.host);
  const fname = path.join(dir, url.pathname);
  const name = req.headers["x-react-server-component-name"];
  if (typeof name === 'string') {
    // TODO can we use node:vm?
    const mod = require(fname);
    const props = Object.fromEntries(url.searchParams.entries());
    renderToPipeableStream((mod[name] || mod)(props), bundlerConfig).pipe(res);
    return;
  }
  await next();
};

export default rscDefault;
