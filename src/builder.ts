import path from "node:path";
import fs from "node:fs";
import url from "node:url";

import { build } from "vite";
import * as swc from "@swc/core";

import type { Config } from "./config.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const walkDirSync = (dir: string, callback: (filePath: string) => void) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
    const filePath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      walkDirSync(filePath, callback);
    } else {
      callback(filePath);
    }
  });
};

const getEntryFiles = (dir: string) => {
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
  const basePath = path.resolve(config.build?.basePath || "/");
  const distDir = config.files?.distDir || "dist";
  const publicDir = path.join(distDir, config.files?.publicDir || "public");
  const indexHtmlFile = path.resolve(
    dir,
    config.files?.indexHtml || "index.html"
  );
  const entriesFile = path.resolve(
    dir,
    distDir,
    config.files?.entries || "entries.js"
  );

  const entryFiles = Object.fromEntries(
    getEntryFiles(dir).map((fname, i) => [`rsc${i}`, fname])
  );
  const output = await build({
    root: dir,
    base: basePath,
    resolve: {
      alias: {
        "wakuwork/client": path.resolve(__dirname, "client.js"),
      },
    },
    build: {
      outDir: publicDir,
      rollupOptions: {
        input: {
          main: indexHtmlFile,
          ...entryFiles,
        },
      },
    },
  });
  const clientEntries: Record<string, string> = {};
  if ("output" in output) {
    for (const item of output.output) {
      const { name, fileName } = item;
      const entryFile = name && entryFiles[name];
      if (entryFile) {
        clientEntries[path.relative(dir, entryFile)] = fileName;
      }
    }
  }
  console.log("clientEntries", clientEntries);

  compileFiles(dir, distDir);
  fs.appendFileSync(
    entriesFile,
    `export const clientEntries=${JSON.stringify(clientEntries)};`
  );
}
