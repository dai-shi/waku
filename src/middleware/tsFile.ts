import path from "node:path";
import fs from "node:fs";
import Module from "node:module";

import * as swc from "@swc/core";

import type { MiddlewareCreator } from "./common.ts";

const require = Module.createRequire(import.meta.url);

// HACK to emulate webpack require
const codeToInject = swc.parseSync(`
  globalThis.__webpack_require__ = function (id) {
    return import(id);
  };
`);

const tsFile: MiddlewareCreator = (config) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const getVersion = (name: string) => {
    const packageJson = require(path.join(dir, "package.json"));
    const version = packageJson.dependencies[name];
    return version ? `@${version.replace(/^\^/, "")}` : "";
  };
  return async (req, res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    const fname = path.join(dir, url.pathname);
    if ([".ts", ".tsx", ".mts"].some((ext) => fname.endsWith(ext))) {
      if (!fs.existsSync(fname)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const mod = await swc.parseFile(fname, {
        syntax: "typescript",
        tsx: fname.endsWith(".tsx"),
      });
      // HACK we should transpile by ourselves in the future TODO
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
      mod.body.push(...codeToInject.body);
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
    await next();
  };
};

export default tsFile;
