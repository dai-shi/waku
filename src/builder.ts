import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { createRequire } from "node:module";

import { build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as swc from "@swc/core";
import { createElement } from "react";
import RSDWRegister from "react-server-dom-webpack/node-register";
import RSDWServer from "react-server-dom-webpack/server";

import type { Config } from "./config.js";
import type { GetEntry, Prefetcher, Prerenderer } from "./server.js";

const { renderToPipeableStream } = RSDWServer;

// TODO we would like a native solution without hacks
// https://nodejs.org/api/esm.html#loaders
RSDWRegister();

// TODO we have duplicate code here and rscPrd.ts

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

const compileFiles = (dir: string, distPath: string) => {
  walkDirSync(dir, (fname) => {
    const relativePath = path.relative(dir, fname);
    if (relativePath.startsWith(distPath)) {
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
        distPath,
        relativePath.replace(/\.tsx?$/, ".js")
      );
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, code);
    }
  });
};

const prerender = async (
  dir: string,
  distPath: string,
  publicPath: string,
  entriesFile: string,
  basePath: string
) => {
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
        ({ href: path.relative(path.join(dir, distPath), p) } as any);
    }
    m._compile(code, fname);
    url.pathToFileURL = savedPathToFileURL;
  };

  let getEntry: GetEntry | undefined;
  let prefetcher: Prefetcher | undefined;
  let prerenderer: Prerenderer | undefined;
  let clientEntries: Record<string, string> | undefined;
  try {
    ({
      getEntry,
      prefetcher,
      prerenderer,
      clientEntries,
    } = require(entriesFile));
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
  const getClientEntry = (filePath: string) => {
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
    return clientEntry;
  };
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, id: string) {
        const [filePath, name] = id.split("#");
        if (filePath!.startsWith("wakuwork/")) {
          return {
            id: filePath,
            chunks: [],
            name,
            async: true,
          };
        }
        const clientEntry = getClientEntry(filePath!);
        return {
          id: basePath + clientEntry,
          chunks: [],
          name,
          async: true,
        };
      },
    }
  );

  if (prerenderer) {
    const { entryItems = [], paths = [] } = await prerenderer();
    for (const [rscId, props] of entryItems) {
      // FIXME we blindly expect JSON.stringify usage is deterministic
      const serializedProps = JSON.stringify(props);
      const searchParams = new URLSearchParams();
      searchParams.set("props", serializedProps);
      const destFile = path.join(
        dir,
        publicPath,
        "RSC",
        `${rscId}?${searchParams}`
      );
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      const component = await getFunctionComponent(rscId);
      if (component) {
        renderToPipeableStream(
          createElement(component, props as any),
          bundlerConfig
        ).pipe(fs.createWriteStream(destFile));
      }
    }
    console.log("TODO", paths, prefetcher);
  }
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
  const require = createRequire(import.meta.url);

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
  await prerender(dir, distPath, publicPath, entriesFile, basePath);

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
