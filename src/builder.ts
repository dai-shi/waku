import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { build } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as swc from "@swc/core";

import type { Config } from "./config.js";
import { codeToInject } from "./middleware/lib/rsc-utils.js";
import {
  shutdown,
  setClientEntries,
  getCustomModulesRSC,
  buildRSC,
} from "./middleware/lib/rsc-handler.js";

// FIXME we could do this without plugin anyway
const rscIndexPlugin = (): Plugin => {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: codeToInject,
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

export async function runBuild(config: Config = {}) {
  const dir = path.resolve(config.build?.dir || ".");
  const basePath = config.build?.basePath || "/";
  const distPath = config.files?.dist || "dist";
  const publicPath = path.join(distPath, config.files?.public || "public");
  const indexHtmlFile = path.join(dir, config.files?.indexHtml || "index.html");
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

  const customModules = await getCustomModulesRSC();
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
    ssr: {
      // FIXME Without this, waku/router isn't considered to have client
      // entries, and "No client entry" error occurs.
      // Unless we fix this, RSC-capable packages aren't supported.
      // This also seems to cause problems with pnpm.
      noExternal: ["waku"],
    },
    build: {
      outDir: distPath,
      write: false,
      ssr: true,
      rollupOptions: {
        input: {
          entries: entriesFile,
          ...customModules,
        },
      },
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
    ssr: {
      noExternal: Array.from(clientEntryFileSet).map(
        (fname) =>
          path.relative(path.join(dir, "node_modules"), fname).split("/")[0]!
      ),
    },
    build: {
      outDir: distPath,
      ssr: true,
      rollupOptions: {
        input: {
          entries: entriesFile,
          ...clientEntryFiles,
          ...serverEntryFiles,
          ...customModules,
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
            if (chunkInfo.name === "entries" || customModules[chunkInfo.name]) {
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

  const absoluteClientEntries = Object.fromEntries(
    Object.entries(clientEntries).map(([key, val]) => [
      path.join(path.dirname(entriesFile), distPath, key),
      basePath + val,
    ])
  );
  await setClientEntries(absoluteClientEntries);

  await buildRSC();

  const origPackageJson = require(path.join(dir, "package.json"));
  const packageJson = {
    name: origPackageJson.name,
    version: origPackageJson.version,
    private: true,
    type: "module",
    scripts: {
      start: "waku start",
    },
    dependencies: origPackageJson.dependencies,
  };
  fs.writeFileSync(
    path.join(dir, distPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  await shutdown();
}
