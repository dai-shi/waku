import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";

import { configFileConfig, resolveConfig } from "./config.js";
import { generatePrefetchCode } from "./rsc-utils.js";
import {
  shutdown,
  setClientEntries,
  renderRSC,
  getBuilderRSC,
} from "./rsc-handler.js";
import { rscIndexPlugin, rscAnalyzePlugin } from "./vite-plugin-rsc.js";
import type { RollupWarning, WarningHandler } from "rollup";

const createVercelOutput = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  clientFiles: string[],
  rscFiles: string[],
  htmlFiles: string[]
) => {
  const srcDir = path.join(
    config.root,
    config.build.outDir,
    config.framework.outPublic
  );
  const dstDir = path.join(
    config.root,
    config.build.outDir,
    ".vercel",
    "output"
  );
  for (const file of [...clientFiles, ...rscFiles, ...htmlFiles]) {
    const dstFile = path.join(dstDir, "static", path.relative(srcDir, file));
    if (!fs.existsSync(dstFile)) {
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.symlinkSync(path.relative(path.dirname(dstFile), file), dstFile);
    }
  }
  const overrides = Object.fromEntries([
    ...rscFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(srcDir, file),
        { contentType: "text/plain" },
      ]),
    ...htmlFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(srcDir, file),
        { contentType: "text/html" },
      ]),
  ]);
  const configJson = {
    version: 3,
    overrides,
  };
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(
    path.join(dstDir, "config.json"),
    JSON.stringify(configJson, null, 2)
  );
};

const resolveFileName = (fname: string) => {
  for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
    const resolvedName =
      fname.slice(0, fname.length - path.extname(fname).length) + ext;
    if (fs.existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return "";
};

// Upstream issue: https://github.com/rollup/rollup/issues/4699
const onwarn = (warning: RollupWarning, warn: WarningHandler) => {
  if (
    warning.code === "MODULE_LEVEL_DIRECTIVE" &&
    warning.message.includes("use client")
  ) {
    return;
  } else if (
    warning.code === "SOURCEMAP_ERROR" &&
    warning.loc?.file?.endsWith(".tsx") &&
    warning.loc?.column === 0 &&
    warning.loc?.line === 1
  ) {
    return;
  }
  warn(warning);
};

// FIXME too long function body
export async function build() {
  const config = await resolveConfig("build");
  const indexHtmlFile = path.join(config.root, config.framework.indexHtml);
  const distEntriesFile = path.join(
    config.root,
    config.build.outDir,
    config.framework.entriesJs
  );
  let entriesFile = path.join(config.root, config.framework.entriesJs);
  if (entriesFile.endsWith(".js")) {
    entriesFile = resolveFileName(entriesFile) || entriesFile;
  }
  const require = createRequire(import.meta.url);

  const clientEntryFileSet = new Set<string>();
  const serverEntryFileSet = new Set<string>();
  await viteBuild({
    ...configFileConfig,
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
      write: false,
      ssr: true,
      rollupOptions: {
        onwarn,
        input: {
          entries: entriesFile,
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

  const serverBuildOutput = await viteBuild({
    ...configFileConfig,
    ssr: {
      noExternal: Array.from(clientEntryFileSet).map(
        // FIXME this might not work with pnpm
        (fname) =>
          path
            .relative(path.join(config.root, "node_modules"), fname)
            .split("/")[0]!
      ),
    },
    build: {
      ssr: true,
      rollupOptions: {
        onwarn,
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
            if (
              clientEntryFiles[chunkInfo.name] ||
              serverEntryFiles[chunkInfo.name]
            ) {
              return "assets/[name].js";
            }
            return "[name].js";
          },
        },
      },
    },
  });
  if (!("output" in serverBuildOutput)) {
    throw new Error("Unexpected vite server build output");
  }

  const clientBuildOutput = await viteBuild({
    ...configFileConfig,
    plugins: [
      // @ts-expect-error This expression is not callable.
      react(),
      rscIndexPlugin(),
    ],
    build: {
      outDir: path.join(config.build.outDir, config.framework.outPublic),
      rollupOptions: {
        onwarn,
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
      path.join(path.dirname(entriesFile), config.build.outDir, key),
      config.base + val,
    ])
  );
  await setClientEntries(absoluteClientEntries, "build");

  const basePrefix = config.base + config.framework.rscPrefix;
  const pathMap = await getBuilderRSC();
  const clientModuleMap = new Map<string, Set<string>>();
  const addClientModule = (
    rscId: string,
    serializedProps: string,
    id: string
  ) => {
    const key = rscId + "/" + serializedProps;
    let idSet = clientModuleMap.get(key);
    if (!idSet) {
      idSet = new Set();
      clientModuleMap.set(key, idSet);
    }
    idSet.add(id);
  };
  const getClientModules = (rscId: string, serializedProps: string) => {
    const key = rscId + "/" + serializedProps;
    const idSet = clientModuleMap.get(key);
    return Array.from(idSet || []);
  };
  const rscFileSet = new Set<string>(); // XXX could be implemented better
  await Promise.all(
    Object.entries(pathMap).map(async ([, { elements }]) => {
      for (const [rscId, props] of elements || []) {
        // FIXME we blindly expect JSON.stringify usage is deterministic
        const serializedProps = JSON.stringify(props);
        const searchParams = new URLSearchParams();
        searchParams.set("props", serializedProps);
        const destFile = path.join(
          config.root,
          config.build.outDir,
          config.framework.outPublic,
          config.framework.rscPrefix + decodeURIComponent(rscId),
          decodeURIComponent(`${searchParams}`)
        );
        if (!rscFileSet.has(destFile)) {
          rscFileSet.add(destFile);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          const pipeable = renderRSC({ rscId, props }, (id) =>
            addClientModule(rscId, serializedProps, id)
          );
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(destFile);
            stream.on("finish", resolve);
            stream.on("error", reject);
            pipeable.pipe(stream);
          });
        }
      }
    })
  );

  const publicIndexHtmlFile = path.join(
    config.root,
    config.build.outDir,
    config.framework.outPublic,
    config.framework.indexHtml
  );
  const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
    encoding: "utf8",
  });
  const htmlFiles = await Promise.all(
    Object.entries(pathMap).map(async ([pathStr, { elements, customCode }]) => {
      const destFile = path.join(
        config.root,
        config.build.outDir,
        config.framework.outPublic,
        pathStr,
        pathStr.endsWith("/") ? "index.html" : ""
      );
      let data = "";
      if (fs.existsSync(destFile)) {
        data = fs.readFileSync(destFile, { encoding: "utf8" });
      } else {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        data = publicIndexHtml;
      }
      const code =
        generatePrefetchCode(
          basePrefix,
          Array.from(elements || []).flatMap(([rscId, props, skipPrefetch]) => {
            if (skipPrefetch) {
              return [];
            }
            return [[rscId, props]];
          }),
          Array.from(elements || []).flatMap(([rscId, props]) => {
            // FIXME we blindly expect JSON.stringify usage is deterministic
            const serializedProps = JSON.stringify(props);
            return getClientModules(rscId, serializedProps);
          })
        ) + (customCode || "");
      if (code) {
        // HACK is this too naive to inject script code?
        data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
      }
      fs.writeFileSync(destFile, data, { encoding: "utf8" });
      return destFile;
    })
  );

  const origPackageJson = require(path.join(config.root, "package.json"));
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
    path.join(config.root, config.build.outDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // https://vercel.com/docs/build-output-api/v3
  // So far, only static sites are supported.
  createVercelOutput(
    config,
    clientBuildOutput.output.map(({ fileName }) =>
      path.join(
        config.root,
        config.build.outDir,
        config.framework.outPublic,
        fileName
      )
    ),
    Array.from(rscFileSet),
    htmlFiles
  );

  await shutdown();
}
