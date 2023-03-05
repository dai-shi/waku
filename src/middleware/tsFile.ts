import path from "node:path";
import fs from "node:fs";
import Module from "node:module";

import * as swc from "@swc/core";

import type { Middleware } from "../config";

const require = Module.createRequire(import.meta.url);
const extensions = [".ts", ".tsx"];

// HACK to emulate webpack require
const codeToInject = swc.parseSync(`
  globalThis.__webpack_require__ = function (id) {
    return import(id);
  };
`);

export const tsFile: Middleware = async (config, req, res, next) => {
  const dir = path.resolve(config?.devServer?.dir || ".");
  const resolveFile = (name: string) => {
    for (const ext of ["", ...extensions]) {
      const fname = path.join(dir, name + ext);
      if (fs.existsSync(fname)) {
        return fname;
      }
    }
    return null;
  };
  const getVersion = (name: string) => {
    const packageJson = require(path.join(dir, "package.json"));
    const version = packageJson.dependencies[name];
    return version ? `@${version.replace(/^\^/, "")}` : "";
  };
  const url = new URL(req.url || "", "http://" + req.headers.host);
  const fname = resolveFile(url.pathname);
  if (fname && extensions.some((ext) => fname.endsWith(ext))) {
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
  await next();
};
