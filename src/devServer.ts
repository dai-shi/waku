import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import Module from "node:module";
import { URL } from "node:url";

import * as swc from "@swc/core";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { Config } from "./config";

const { renderToPipeableStream } = RSDWServer;
const require = Module.createRequire(import.meta.url);
const extensions = [".ts", ".tsx"];

RSDWRegister();

// HACK to emulate webpack require
const codeToInject = swc.parseSync(`
  globalThis.__webpack_require__ = function (id) {
    return import(id);
  };
`);

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

const savedLoad = (Module as any)._load;

export function startDevServer(config?: Config) {
  const dir = path.resolve(config?.devServer?.dir || ".");

  const resolveFile = (name: string) => {
    for (const ext of ["", ...extensions]) {
      try {
        const fname = path.join(dir, name + ext);
        fs.statSync(fname);
        return fname;
      } catch (e) {
        continue;
      }
    }
    throw new Error(`File not found: ${name}`);
  };

  (Module as any)._load = (fname: string, m: any, isMain: boolean) => {
    try {
      fname = resolveFile(fname);
    } catch (e) {
      // ignored
    }
    return savedLoad(fname, m, isMain);
  };

  const getVersion = (name: string) => {
    const packageJson = require(path.join(dir, "package.json"));
    const version = packageJson.dependencies[name];
    return version ? `@${version.replace(/^\^/, "")}` : "";
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

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://" + req.headers.host);
      if (url.pathname === "/") {
        const fname = path.join(dir, "index.html");
        const stat = fs.statSync(fname);
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        fs.createReadStream(fname).pipe(res);
        return;
      }
      const fname = resolveFile(url.pathname);
      if (url.searchParams.has("__RSC")) {
        const name = url.searchParams.get("__RSC_NAME") || "default";
        url.searchParams.delete("__RSC");
        url.searchParams.delete("__RSC_NAME");
        // TODO can we use node:vm?
        const mod = require(fname);
        const props = Object.fromEntries(url.searchParams.entries());
        renderToPipeableStream((mod[name] || mod)(props), bundlerConfig).pipe(
          res
        );
        return;
      }
      if (extensions.some((ext) => fname.endsWith(ext))) {
        const mod = await swc.parseFile(fname, {
          syntax: "typescript",
          tsx: fname.endsWith(".tsx"),
        });
        mod.body.push(...codeToInject.body);
        // HACK we should transpile by ourselves in the future
        mod.body.forEach((node) => {
          if (node.type === "ImportDeclaration") {
            const match = node.source.value.match(/^([-\w]+)(\/[-\w\/]+)?$/);
            if (match) {
              node.source.value = `https://esm.sh/${match[1]}${getVersion(
                match[1] as string
              )}${match[2] || ""}`;
            }
          }
        });
        const { code } = await swc.transform(mod, {
          sourceMaps: "inline",
          jsc: {
            transform: {
              react: {
                runtime: "automatic",
                importSource: `https://esm.sh/react${getVersion("react")}`,
              },
            },
          },
        });
        res.setHeader("Content-Length", code.length);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(code);
        return;
      }
      const stat = fs.statSync(fname);
      res.setHeader("Content-Length", stat.size);
      // FIXME use proper content-type
      res.setHeader("Content-Type", "application/octet-stream");
      fs.createReadStream(fname).pipe(res);
    } catch (e) {
      console.info(e);
    }
    res.statusCode = 404;
    res.end();
  });

  server.listen(config?.devServer?.port ?? 3000);
}
