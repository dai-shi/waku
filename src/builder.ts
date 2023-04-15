import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as swc from "@swc/core";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import type { Config } from "./config.js";
import type { GetEntry, Prefetcher, Prerenderer } from "./server.js";
import {
  generatePrefetchCode,
  transformRsfId,
} from "./middleware/rewriteRsc.js";

const { renderToPipeableStream } = RSDWServer;

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

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
    // TODO transpile ".jsx"
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
      const { code } = swc.transformFileSync(fname, {
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
      });
      const destFile = path.join(
        dir,
        distPath,
        relativePath.replace(/\.tsx?$/, ".js")
      );
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, code);
    }
    // TODO transpile ".jsx"
  });
};

const prerender = async (
  dir: string,
  distPath: string,
  publicPath: string,
  entriesFile: string,
  basePath: string,
  publicIndexHtmlFile: string
): Promise<Record<string, string>> => {
  const serverEntries: Record<string, string> = {};
  const registerServerEntry = (fileId: string): string => {
    for (const entry of Object.entries(serverEntries)) {
      if (entry[1] === fileId) {
        return entry[0];
      }
    }
    const id = `rsf${Object.keys(serverEntries).length}`;
    serverEntries[id] = fileId;
    return id;
  };

  const { getEntry, prefetcher, prerenderer, clientEntries } = await (import(
    entriesFile
  ) as Promise<{
    getEntry: GetEntry;
    prefetcher?: Prefetcher;
    prerenderer?: Prerenderer;
    clientEntries?: Record<string, string>;
  }>);

  const getFunctionComponent = async (rscId: string) => {
    const mod = await getEntry(rscId);
    if (typeof mod === "function") {
      return mod;
    }
    return mod.default;
  };
  const getClientEntry = (id: string) => {
    if (!clientEntries) {
      throw new Error("Missing client entries");
    }
    const clientEntry =
      clientEntries[id] ||
      clientEntries[id.replace(/\.js$/, ".ts")] ||
      clientEntries[id.replace(/\.js$/, ".tsx")];
    if (!clientEntry) {
      throw new Error("No client entry found");
    }
    return clientEntry;
  };
  const decodeId = (encodedId: string): [id: string, name: string] => {
    let [id, name] = encodedId.split("#") as [string, string];
    if (!id.startsWith("wakuwork/")) {
      id = path.relative("file://" + encodeURI(path.join(dir, distPath)), id);
      id = basePath + getClientEntry(decodeURI(id));
    }
    return [id, name];
  };
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [id, name] = decodeId(encodedId);
        return { id, chunks: [], name, async: true };
      },
    }
  );

  if (prerenderer) {
    const {
      entryItems = [],
      paths = [],
      unstable_customCode = () => "",
    } = await prerenderer();
    await Promise.all(
      Array.from(entryItems).map(async ([rscId, props]) => {
        // FIXME we blindly expect JSON.stringify usage is deterministic
        const serializedProps = JSON.stringify(props);
        const searchParams = new URLSearchParams();
        searchParams.set("props", serializedProps);
        const destFile = path.join(
          dir,
          publicPath,
          "RSC",
          decodeURIComponent(rscId),
          decodeURIComponent(`${searchParams}`)
        );
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        const component = await getFunctionComponent(rscId);
        if (component) {
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(destFile);
            stream.on("finish", resolve);
            stream.on("error", reject);
            renderToPipeableStream(
              createElement(component, props as any),
              bundlerConfig
            )
              .pipe(
                transformRsfId(
                  "file://" + encodeURI(path.join(dir, distPath)),
                  registerServerEntry
                )
              )
              .pipe(stream);
          });
        }
      })
    );

    for (const pathItem of paths) {
      let code = "";
      if (prefetcher) {
        const { entryItems = [], clientModules = [] } = await prefetcher(
          pathItem
        );
        const moduleIds: string[] = [];
        for (const m of clientModules as any[]) {
          if (m["$$typeof"] !== CLIENT_REFERENCE) {
            throw new Error("clientModules must be client references");
          }
          const [id] = decodeId(m["$$id"]);
          moduleIds.push(id);
        }
        code += generatePrefetchCode?.(entryItems, moduleIds) || "";
      }
      const destFile = path.join(
        dir,
        publicPath,
        pathItem,
        pathItem.endsWith("/") ? "index.html" : ""
      );
      let data = "";
      if (fs.existsSync(destFile)) {
        data = fs.readFileSync(destFile, { encoding: "utf8" });
      } else {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        data = fs.readFileSync(publicIndexHtmlFile, { encoding: "utf8" });
      }
      if (code) {
        // HACK is this too naive to inject script code?
        data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
      }
      const code2 = unstable_customCode(pathItem, decodeId);
      if (code2) {
        data = data.replace(/<\/body>/, `<script>${code2}</script></body>`);
      }
      fs.writeFileSync(destFile, data, { encoding: "utf8" });
    }
  }

  return serverEntries;
};

export async function runBuild(config: Config = {}) {
  const dir = path.resolve(config.build?.dir || ".");
  const basePath = config.build?.basePath || "/";
  const distPath = config.files?.dist || "dist";
  const publicPath = path.join(distPath, config.files?.public || "public");
  const indexHtmlFile = path.join(dir, config.files?.indexHtml || "index.html");
  const publicIndexHtmlFile = path.join(
    dir,
    publicPath,
    config.files?.indexHtml || "index.html"
  );
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
    `export const clientEntries=${JSON.stringify(clientEntries)};`
  );
  const serverEntries = await prerender(
    dir,
    distPath,
    publicPath,
    entriesFile,
    basePath,
    publicIndexHtmlFile
  );
  console.log("serverEntries", serverEntries);
  fs.appendFileSync(
    entriesFile,
    `export const serverEntries=${JSON.stringify(serverEntries)};`
  );

  const origPackageJson = require(path.join(dir, "package.json"));
  const packageJson = {
    name: origPackageJson.name,
    version: origPackageJson.version,
    private: true,
    type: "module",
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
