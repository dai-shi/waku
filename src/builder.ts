import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as swc from "@swc/core";

import type { Config } from "./config.js";

const require = createRequire(import.meta.url);

const rscPlugin = (): Plugin => {
  const code = `
globalThis.__webpack_require__ = (id) => {
  const cache = globalThis.__webpack_require__wakuwork_cache;
  if (cache && cache.has(id)) return cache.get(id);
  return import(id);
};`;
  return {
    name: "rscPlugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: code,
          injectTo: "body",
        },
      ];
    },
  };
};

const walkDirSync = (dir: string, callback: (filePath: string) => void) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
    const filePath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name !== "node_modules") {
        walkDirSync(filePath, callback);
      }
    } else {
      callback(filePath);
    }
  });
};

const getClientEntryFiles = (dir: string) => {
  const files: string[] = [];
  walkDirSync(dir, (fname) => {
    if (fname.endsWith(".ts") || fname.endsWith(".tsx")) {
      const mod = swc.parseFileSync(fname, {
        syntax: "typescript",
        tsx: fname.endsWith(".tsx"),
      });
      for (const item of mod.body) {
        if (
          item.type === "ExpressionStatement" &&
          item.expression.type === "StringLiteral" &&
          item.expression.value === "use client"
        ) {
          files.push(fname);
        }
      }
    }
  });
  return files;
};

const compileFiles = (dir: string, dist: string) => {
  walkDirSync(dir, (fname) => {
    const relativePath = path.relative(dir, fname);
    if (relativePath.startsWith(dist)) {
      return;
    }
    if (fname.endsWith(".ts") || fname.endsWith(".tsx")) {
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
      const destFile = path.join(
        dir,
        dist,
        relativePath.replace(/\.tsx?$/, ".js")
      );
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, code);
    }
  });
};

export async function runBuild(config: Config = {}) {
  const dir = path.resolve(config.build?.dir || ".");
  const basePath = config.build?.basePath || "/";
  const distPath = config.files?.dist || "dist";
  const publicPath = path.join(distPath, config.files?.public || "public");
  const indexHtmlFile = path.join(dir, config.files?.indexHtml || "index.html");
  const entriesFile = path.join(
    dir,
    distPath,
    config.files?.entriesJs || "entries.js"
  );

  const clientEntryFiles = Object.fromEntries(
    getClientEntryFiles(dir).map((fname, i) => [`rsc${i}`, fname])
  );
  const output = await build({
    root: dir,
    base: basePath,
    plugins: [
      // @ts-ignore
      react(),
      rscPlugin(),
    ],
    build: {
      outDir: publicPath,
      rollupOptions: {
        input: {
          main: indexHtmlFile,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: "exports-only",
      },
    },
  });
  const clientEntries: Record<string, string> = {};
  if (!("output" in output)) {
    throw new Error("Unexpected vite build output");
  }
  for (const item of output.output) {
    const { name, fileName } = item;
    const entryFile = name && clientEntryFiles[name];
    if (entryFile) {
      clientEntries[path.relative(dir, entryFile)] = fileName;
    }
  }
  console.log("clientEntries", clientEntries);

  compileFiles(dir, distPath);
  fs.appendFileSync(
    entriesFile,
    `exports.clientEntries=${JSON.stringify(clientEntries)};`
  );
  const origPackageJson = require(path.join(dir, "package.json"));
  const packageJson = {
    name: origPackageJson.name,
    version: origPackageJson.version,
    private: true,
    type: "commonjs",
    scripts: {
      start: "wakuwork start",
    },
    dependencies: origPackageJson.dependencies,
  };
  fs.writeFileSync(
    path.join(dir, distPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
}
