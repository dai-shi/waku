import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

import { build as viteBuild } from "vite";
import viteReact from "@vitejs/plugin-react";
import type { RollupLog, LoggingFunction } from "rollup";

import { configFileConfig, resolveConfig } from "./config.js";
import { generatePrefetchCode } from "./middleware/rsc/utils.js";
import {
  shutdown,
  renderRSC,
  getBuildConfigRSC,
  getSsrConfigRSC,
} from "./middleware/rsc/worker-api.js";
import { rscIndexPlugin } from "./vite-plugin/rsc-index-plugin.js";
import { rscAnalyzePlugin } from "./vite-plugin/rsc-analyze-plugin.js";
import { renderHtmlToReadable } from "./middleware/ssr/utils.js";

// Upstream issue: https://github.com/rollup/rollup/issues/4699
const onwarn = (warning: RollupLog, defaultHandler: LoggingFunction) => {
  if (
    warning.code === "MODULE_LEVEL_DIRECTIVE" &&
    /"use (client|server)"/.test(warning.message)
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
  defaultHandler(warning);
};

const hash = (fname: string) =>
  new Promise<string>((resolve) => {
    const sha256 = createHash("sha256");
    sha256.on("readable", () => {
      const data = sha256.read();
      if (data) {
        resolve(data.toString("hex").slice(0, 9));
      }
    });
    fs.createReadStream(fname).pipe(sha256);
  });

const analyzeEntries = async (entriesFile: string) => {
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
    resolve: {
      conditions: ["react-server"],
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
    await Promise.all(
      Array.from(clientEntryFileSet).map(async (fname, i) => [
        `rsc${i}-${await hash(fname)}`,
        fname,
      ])
    )
  );
  const serverEntryFiles = Object.fromEntries(
    Array.from(serverEntryFileSet).map((fname, i) => [`rsf${i}`, fname])
  );
  return {
    clientEntryFiles,
    serverEntryFiles,
  };
};

const buildServerBundle = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  entriesFile: string,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>
) => {
  const serverBuildOutput = await viteBuild({
    ...configFileConfig,
    resolve: {
      conditions: ["react-server"],
    },
    publicDir: false,
    build: {
      ssr: true,
      outDir: config.framework.distDir,
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
            if (
              chunk.moduleIds.some((id) =>
                Object.values(clientEntryFiles).includes(id)
              )
            ) {
              code += '"use client";';
            }
            if (
              chunk.moduleIds.some((id) =>
                Object.values(serverEntryFiles).includes(id)
              )
            ) {
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
  return serverBuildOutput;
};

const buildClientBundle = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  clientEntryFiles: Record<string, string>
) => {
  const indexHtmlFile = path.join(
    config.root,
    config.framework.srcDir,
    config.framework.indexHtml
  );
  const clientBuildOutput = await viteBuild({
    ...configFileConfig,
    plugins: [
      // @ts-expect-error This expression is not callable.
      viteReact(),
      rscIndexPlugin(),
    ],
    root: path.join(config.root, config.framework.srcDir),
    build: {
      outDir: path.join(
        config.root,
        config.framework.distDir,
        config.framework.publicDir
      ),
      rollupOptions: {
        onwarn,
        input: {
          main: indexHtmlFile,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: "exports-only",
        output: {
          entryFileNames: (chunkInfo) => {
            if (clientEntryFiles[chunkInfo.name]) {
              return "assets/[name].js";
            }
            return "assets/[name]-[hash].js";
          },
        },
      },
    },
  });
  if (!("output" in clientBuildOutput)) {
    throw new Error("Unexpected vite client build output");
  }
  return clientBuildOutput;
};

const emitRscFiles = async (
  config: Awaited<ReturnType<typeof resolveConfig>>
) => {
  const buildConfig = await getBuildConfigRSC();
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
    Object.entries(buildConfig).map(async ([, { elements, ctx }]) => {
      for (const [rscId, props] of elements || []) {
        // FIXME we blindly expect JSON.stringify usage is deterministic
        const serializedProps = JSON.stringify(props);
        const searchParams = new URLSearchParams();
        searchParams.set("props", serializedProps);
        const destFile = path.join(
          config.root,
          config.framework.distDir,
          config.framework.publicDir,
          config.framework.rscPrefix + decodeURIComponent(rscId),
          decodeURIComponent(`${searchParams}`)
        );
        if (!rscFileSet.has(destFile)) {
          rscFileSet.add(destFile);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          const [pipeable] = await renderRSC(
            { rscId, props },
            {
              command: "build",
              ctx,
              moduleIdCallback: (id) =>
                addClientModule(rscId, serializedProps, id),
            }
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
  return { buildConfig, getClientModules, rscFiles: Array.from(rscFileSet) };
};

const renderHtml = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  pathStr: string,
  htmlStr: string,
  ctx: unknown
) => {
  const ssrConfig = await getSsrConfigRSC(pathStr, "build");
  if (!ssrConfig) {
    return null;
  }
  const { splitHTML, getFallback } = config.framework.ssr;
  const [rscId, props] = ssrConfig.element;
  const [pipeable] = await renderRSC(
    { rscId, props },
    { command: "build", ctx }
  );
  return renderHtmlToReadable(htmlStr, pipeable, splitHTML, getFallback);
};

const emitHtmlFiles = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  buildConfig: Awaited<ReturnType<typeof getBuildConfigRSC>>,
  getClientModules: (rscId: string, serializedProps: string) => string[]
) => {
  const basePrefix = config.base + config.framework.rscPrefix;
  const publicIndexHtmlFile = path.join(
    config.root,
    config.framework.distDir,
    config.framework.publicDir,
    config.framework.indexHtml
  );
  const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
    encoding: "utf8",
  });
  const htmlFiles = await Promise.all(
    Object.entries(buildConfig).map(
      async ([pathStr, { elements, customCode, ctx, skipSsr }]) => {
        const destFile = path.join(
          config.root,
          config.framework.distDir,
          config.framework.publicDir,
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
        const elementsForPrefetch = new Set<
          readonly [rscId: string, props: unknown]
        >();
        const moduleIdsForPrefetch = new Set<string>();
        for (const [rscId, props, skipPrefetch] of elements || []) {
          if (!skipPrefetch) {
            elementsForPrefetch.add([rscId, props]);
            // FIXME we blindly expect JSON.stringify usage is deterministic
            const serializedProps = JSON.stringify(props);
            for (const id of getClientModules(rscId, serializedProps)) {
              moduleIdsForPrefetch.add(id);
            }
          }
        }
        const code =
          generatePrefetchCode(
            basePrefix,
            elementsForPrefetch,
            moduleIdsForPrefetch
          ) + (customCode || "");
        if (code) {
          // HACK is this too naive to inject script code?
          data = data.replace(/<\/head>/, `<script>${code}</script></head>`);
        }
        const htmlReadable =
          !skipSsr && (await renderHtml(config, pathStr, data, ctx));
        if (htmlReadable) {
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(destFile);
            stream.on("finish", resolve);
            stream.on("error", reject);
            htmlReadable.pipe(stream);
          });
        } else {
          fs.writeFileSync(destFile, data, { encoding: "utf8" });
        }
        return destFile;
      }
    )
  );
  return { htmlFiles };
};

const emitVercelOutput = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  clientBuildOutput: Awaited<ReturnType<typeof buildClientBundle>>,
  rscFiles: string[],
  htmlFiles: string[]
) => {
  const clientFiles = clientBuildOutput.output.map(({ fileName }) =>
    path.join(
      config.root,
      config.framework.distDir,
      config.framework.publicDir,
      fileName
    )
  );
  const srcDir = path.join(
    config.root,
    config.framework.distDir,
    config.framework.publicDir
  );
  const dstDir = path.join(
    config.root,
    config.framework.distDir,
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
  return fname; // returning the default one
};

export async function build() {
  const config = await resolveConfig("build");
  const entriesFile = resolveFileName(
    path.join(config.root, config.framework.srcDir, config.framework.entriesJs)
  );

  const { clientEntryFiles, serverEntryFiles } = await analyzeEntries(
    entriesFile
  );
  await buildServerBundle(
    config,
    entriesFile,
    clientEntryFiles,
    serverEntryFiles
  );
  const clientBuildOutput = await buildClientBundle(config, clientEntryFiles);

  const { buildConfig, getClientModules, rscFiles } = await emitRscFiles(
    config
  );
  const { htmlFiles } = await emitHtmlFiles(
    config,
    buildConfig,
    getClientModules
  );

  // https://vercel.com/docs/build-output-api/v3
  // So far, only static sites are supported.
  emitVercelOutput(config, clientBuildOutput, rscFiles, htmlFiles);

  await shutdown();
}
