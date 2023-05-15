import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as swc from "@swc/core";

import type { Config } from "./config.js";
import type { GetEntry, Prerenderer } from "./server.js";
import { renderRSC, prefetcherRSC } from "./middleware/lib/rsc-handler.js";

// TODO we have duplicate code here and rscPrd.ts and rsc-handler*.ts

// FIXME we could do this without plugin anyway
const rscIndexPlugin = (): Plugin => {
  const code = `
globalThis.__wakuwork_module_cache__ = new Map();
globalThis.__webpack_chunk_load__ = async (id) => id.startsWith("wakuwork/") || import(id).then((m) => globalThis.__wakuwork_module_cache__.set(id, m));
globalThis.__webpack_require__ = (id) => globalThis.__wakuwork_module_cache__.get(id);
`;
  return {
    name: "rsc-index-plugin",
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

const rscAnalyzePlugin = (
  clientEntryCallback: (id: string) => void,
  serverEntryCallback: (id: string) => void
): Plugin => {
  return {
    name: "rsc-bundle-plugin",
    transform(code, id) {
      const ext = path.extname(id);
      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
          tsx: ext === ".tsx",
        });
        for (const item of mod.body) {
          if (
            item.type === "ExpressionStatement" &&
            item.expression.type === "StringLiteral"
          ) {
            if (item.expression.value === "use client") {
              clientEntryCallback(id);
            } else if (item.expression.value === "use server") {
              serverEntryCallback(id);
            }
          }
        }
      }
      return code;
    },
  };
};

const prerender = async (
  dir: string,
  distPath: string,
  publicPath: string,
  distEntriesFile: string,
  basePath: string,
  publicIndexHtmlFile: string
) => {
  const { prerenderer, clientEntries } = await (import(
    distEntriesFile
  ) as Promise<{
    getEntry: GetEntry;
    prerenderer?: Prerenderer;
    clientEntries?: Record<string, string>;
  }>);

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
        await new Promise<void>((resolve, reject) => {
          const stream = fs.createWriteStream(destFile);
          stream.on("finish", resolve);
          stream.on("error", reject);
          renderRSC(
            {
              rscId,
              props: props as any,
            },
            true
          ).pipe(stream);
        });
      })
    );

    const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
      encoding: "utf8",
    });
    for (const pathItem of paths) {
      const code = await prefetcherRSC(pathItem, true);
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
        data = publicIndexHtml;
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
  const distEntriesFile = path.join(
    dir,
    distPath,
    config.files?.entriesJs || "entries.js"
  );
  let entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
  if (entriesFile.endsWith(".js")) {
    for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
      const tmp = entriesFile.slice(0, -3) + ext;
      if (fs.existsSync(tmp)) {
        entriesFile = tmp;
        break;
      }
    }
  }
  const require = createRequire(import.meta.url);

  const clientEntryFileSet = new Set<string>();
  const serverEntryFileSet = new Set<string>();
  await build({
    root: dir,
    base: basePath,
    plugins: [
      rscAnalyzePlugin(
        (id) => clientEntryFileSet.add(id),
        (id) => serverEntryFileSet.add(id)
      ),
    ],
    build: {
      outDir: distPath,
      ssr: entriesFile,
      write: false,
    },
  });
  const clientEntryFiles = Object.fromEntries(
    Array.from(clientEntryFileSet).map((fname, i) => [`rsc${i}`, fname])
  );
  const serverEntryFiles = Object.fromEntries(
    Array.from(serverEntryFileSet).map((fname, i) => [`rsf${i}`, fname])
  );

  const serverBuildOutput = await build({
    root: dir,
    base: basePath,
    build: {
      outDir: distPath,
      ssr: true,
      rollupOptions: {
        input: {
          entries: entriesFile,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
        output: {
          banner: (chunk) => {
            // HACK to bring directives to the front
            let code = "";
            if (chunk.moduleIds.some((id) => clientEntryFileSet.has(id))) {
              code += '"use client";';
            }
            if (chunk.moduleIds.some((id) => serverEntryFileSet.has(id))) {
              code += '"use server";';
            }
            return code;
          },
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "entries") {
              return "[name].js";
            }
            return "assets/[name].js";
          },
        },
      },
    },
  });
  if (!("output" in serverBuildOutput)) {
    throw new Error("Unexpected vite server build output");
  }

  const clientBuildOutput = await build({
    root: dir,
    base: basePath,
    plugins: [
      // @ts-ignore
      react(),
      rscIndexPlugin(),
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
  if (!("output" in clientBuildOutput)) {
    throw new Error("Unexpected vite client build output");
  }

  const clientEntries: Record<string, string> = {};
  for (const item of clientBuildOutput.output) {
    const { name, fileName } = item;
    const entryFile =
      name &&
      serverBuildOutput.output.find(
        (item) =>
          "moduleIds" in item &&
          item.moduleIds.includes(clientEntryFiles[name] as string)
      )?.fileName;
    if (entryFile) {
      clientEntries[entryFile] = fileName;
    }
  }
  console.log("clientEntries", clientEntries);
  fs.appendFileSync(
    distEntriesFile,
    `export const clientEntries=${JSON.stringify(clientEntries)};`
  );

  if (!"STILL WIP") {
    // TODO still wip
    await prerender(
      dir,
      distPath,
      publicPath,
      distEntriesFile,
      basePath,
      publicIndexHtmlFile
    );
  }

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
