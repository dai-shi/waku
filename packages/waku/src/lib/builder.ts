import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as viteBuild } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { RollupLog, LoggingFunction } from 'rollup';

import { setCwd, resolveConfig, viteInlineConfig } from './config.js';
import {
  encodeInput,
  generatePrefetchCode,
  normalizePath,
} from './middleware/rsc/utils.js';
import {
  shutdown as shutdownRsc,
  renderRSC,
  getBuildConfigRSC,
} from './middleware/rsc/worker-api.js';
import { rscIndexPlugin } from './vite-plugin/rsc-index-plugin.js';
import { rscAnalyzePlugin } from './vite-plugin/rsc-analyze-plugin.js';
import { patchReactRefresh } from './vite-plugin/patch-react-refresh.js';
import { renderHtml, shutdown as shutdownSsr } from './middleware/rsc/ssr.js';

// Upstream issue: https://github.com/rollup/rollup/issues/4699
const onwarn = (warning: RollupLog, defaultHandler: LoggingFunction) => {
  if (
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    /"use (client|server)"/.test(warning.message)
  ) {
    return;
  } else if (
    warning.code === 'SOURCEMAP_ERROR' &&
    warning.loc?.file?.endsWith('.tsx') &&
    warning.loc?.column === 0 &&
    warning.loc?.line === 1
  ) {
    return;
  }
  defaultHandler(warning);
};

const hash = (fname: string) =>
  new Promise<string>((resolve) => {
    const sha256 = createHash('sha256');
    sha256.on('readable', () => {
      const data = sha256.read();
      if (data) {
        resolve(data.toString('hex').slice(0, 9));
      }
    });
    fs.createReadStream(fname).pipe(sha256);
  });

const analyzeEntries = async (entriesFile: string) => {
  const commonFileSet = new Set<string>();
  const clientFileSet = new Set<string>();
  const serverFileSet = new Set<string>();
  await viteBuild({
    ...(await viteInlineConfig()),
    plugins: [rscAnalyzePlugin(commonFileSet, clientFileSet, serverFileSet)],
    ssr: {
      resolve: {
        conditions: ['react-server'],
        externalConditions: ['react-server'],
      },
      noExternal: /^(?!node:)/,
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
  const commonEntryFiles = Object.fromEntries(
    await Promise.all(
      Array.from(commonFileSet).map(async (fname, i) => [
        `com${i}-${await hash(fname)}`,
        fname,
      ]),
    ),
  );
  const clientEntryFiles = Object.fromEntries(
    await Promise.all(
      Array.from(clientFileSet).map(async (fname, i) => [
        `rsc${i}-${await hash(fname)}`,
        fname,
      ]),
    ),
  );
  const serverEntryFiles = Object.fromEntries(
    Array.from(serverFileSet).map((fname, i) => [`rsf${i}`, fname]),
  );
  return {
    commonEntryFiles,
    clientEntryFiles,
    serverEntryFiles,
  };
};

const buildServerBundle = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  entriesFile: string,
  distEntriesFile: string,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
) => {
  const serverBuildOutput = await viteBuild({
    ...(await viteInlineConfig()),
    ssr: {
      resolve: {
        conditions: ['react-server'],
        externalConditions: ['react-server'],
      },
      external: ['waku'],
      noExternal: Object.values(clientEntryFiles).flatMap((fname) => {
        const items = fname.split(path.sep);
        const index = items.lastIndexOf('node_modules');
        const name = index >= 0 && items[index + 1];
        return name ? [name] : [];
      }),
    },
    publicDir: false,
    build: {
      ssr: true,
      ssrEmitAssets: true,
      outDir: path.join(config.rootDir, config.distDir),
      rollupOptions: {
        onwarn,
        input: {
          entries: entriesFile,
          ...commonEntryFiles,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
        output: {
          banner: (chunk) => {
            // HACK to bring directives to the front
            let code = '';
            if (
              chunk.moduleIds.some((id) =>
                Object.values(clientEntryFiles).includes(id),
              )
            ) {
              code += '"use client";';
            }
            if (
              chunk.moduleIds.some((id) =>
                Object.values(serverEntryFiles).includes(id),
              )
            ) {
              code += '"use server";';
            }
            return code;
          },
          entryFileNames: (chunkInfo) => {
            if (
              commonEntryFiles[chunkInfo.name] ||
              clientEntryFiles[chunkInfo.name] ||
              serverEntryFiles[chunkInfo.name]
            ) {
              return 'assets/[name].js';
            }
            return '[name].js';
          },
        },
      },
    },
  });
  if (!('output' in serverBuildOutput)) {
    throw new Error('Unexpected vite server build output');
  }
  const code = `export const resolveClientPath = (filePath, invert) => (invert ? ${JSON.stringify(
    Object.fromEntries(
      Object.entries(clientEntryFiles).map(([key, val]) => [
        normalizePath(
          path.join(config.rootDir, config.distDir, 'assets', key + '.js'),
        ),
        val,
      ]),
    ),
  )} : ${JSON.stringify(
    Object.fromEntries(
      Object.entries(clientEntryFiles).map(([key, val]) => [
        val,
        normalizePath(
          path.join(config.rootDir, config.distDir, 'assets', key + '.js'),
        ),
      ]),
    ),
  )})[filePath];
`;
  fs.appendFileSync(distEntriesFile, code);
  return serverBuildOutput;
};

const buildClientBundle = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
) => {
  const indexHtmlFile = path.join(
    config.rootDir,
    config.srcDir,
    config.indexHtml,
  );
  const cssAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  const clientBuildOutput = await viteBuild({
    ...(await viteInlineConfig()),
    root: path.join(config.rootDir, config.srcDir),
    plugins: [patchReactRefresh(viteReact()), rscIndexPlugin(cssAssets)],
    build: {
      outDir: path.join(config.rootDir, config.distDir, config.publicDir),
      rollupOptions: {
        onwarn,
        input: {
          main: indexHtmlFile,
          ...commonEntryFiles,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              commonEntryFiles[chunkInfo.name] ||
              clientEntryFiles[chunkInfo.name]
            ) {
              return 'assets/[name].js';
            }
            return 'assets/[name]-[hash].js';
          },
          // FIXME This is simply to override for examples/07,10 vite configs
          preserveModules: false,
        },
      },
    },
  });
  if (!('output' in clientBuildOutput)) {
    throw new Error('Unexpected vite client build output');
  }
  for (const cssAsset of cssAssets) {
    const from = path.join(config.rootDir, config.distDir, cssAsset);
    const to = path.join(
      config.rootDir,
      config.distDir,
      config.publicDir,
      cssAsset,
    );
    fs.renameSync(from, to);
  }
  return clientBuildOutput;
};

const emitRscFiles = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
) => {
  const buildConfig = await getBuildConfigRSC();
  const clientModuleMap = new Map<string, Set<string>>();
  const addClientModule = (input: string, id: string) => {
    let idSet = clientModuleMap.get(input);
    if (!idSet) {
      idSet = new Set();
      clientModuleMap.set(input, idSet);
    }
    idSet.add(id);
  };
  const getClientModules = (input: string) => {
    const idSet = clientModuleMap.get(input);
    return Array.from(idSet || []);
  };
  const rscFileSet = new Set<string>(); // XXX could be implemented better
  await Promise.all(
    Object.entries(buildConfig).map(async ([, { entries, context }]) => {
      for (const [input] of entries || []) {
        const destFile = path.join(
          config.rootDir,
          config.distDir,
          config.publicDir,
          config.rscPath,
          encodeInput(normalizePath(input)),
        );
        if (!rscFileSet.has(destFile)) {
          rscFileSet.add(destFile);
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          const [readable] = await renderRSC({
            input,
            method: 'GET',
            headers: {},
            command: 'build',
            context,
            moduleIdCallback: (id) => addClientModule(input, id),
          });
          await pipeline(
            Readable.fromWeb(readable as any),
            fs.createWriteStream(destFile),
          );
        }
      }
    }),
  );
  return { buildConfig, getClientModules, rscFiles: Array.from(rscFileSet) };
};

const emitHtmlFiles = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  buildConfig: Awaited<ReturnType<typeof getBuildConfigRSC>>,
  getClientModules: (input: string) => string[],
  ssr: boolean,
) => {
  const basePrefix = config.basePath + config.rscPath + '/';
  const publicIndexHtmlFile = path.join(
    config.rootDir,
    config.distDir,
    config.publicDir,
    config.indexHtml,
  );
  const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  const htmlFiles = await Promise.all(
    Object.entries(buildConfig).map(
      async ([pathStr, { entries, customCode, context }]) => {
        const destFile = path.join(
          config.rootDir,
          config.distDir,
          config.publicDir,
          pathStr,
          pathStr.endsWith('/') ? 'index.html' : '',
        );
        let htmlStr: string;
        if (fs.existsSync(destFile)) {
          htmlStr = fs.readFileSync(destFile, { encoding: 'utf8' });
        } else {
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          htmlStr = publicIndexHtml;
        }
        const inputsForPrefetch = new Set<string>();
        const moduleIdsForPrefetch = new Set<string>();
        for (const [input, skipPrefetch] of entries || []) {
          if (!skipPrefetch) {
            inputsForPrefetch.add(input);
            for (const id of getClientModules(input)) {
              moduleIdsForPrefetch.add(id);
            }
          }
        }
        const code =
          generatePrefetchCode(
            basePrefix,
            inputsForPrefetch,
            moduleIdsForPrefetch,
          ) + (customCode || '');
        if (code) {
          // HACK is this too naive to inject script code?
          htmlStr = htmlStr.replace(
            /<\/head>/,
            `<script>${code}</script></head>`,
          );
        }
        const htmlResult =
          ssr && (await renderHtml(config, 'build', pathStr, htmlStr, context));
        if (htmlResult) {
          const [htmlReadable] = htmlResult;
          await pipeline(
            Readable.fromWeb(htmlReadable as any),
            fs.createWriteStream(destFile),
          );
        } else {
          fs.writeFileSync(destFile, htmlStr);
        }
        return destFile;
      },
    ),
  );
  return { htmlFiles };
};

const emitVercelOutput = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  clientBuildOutput: Awaited<ReturnType<typeof buildClientBundle>>,
  rscFiles: string[],
  htmlFiles: string[],
) => {
  const clientFiles = clientBuildOutput.output.map(({ fileName }) =>
    path.join(config.rootDir, config.distDir, config.publicDir, fileName),
  );
  const srcDir = path.join(config.rootDir, config.distDir, config.publicDir);
  const dstDir = path.join(config.rootDir, config.distDir, '.vercel', 'output');
  for (const file of [...clientFiles, ...rscFiles, ...htmlFiles]) {
    const dstFile = path.join(dstDir, 'static', path.relative(srcDir, file));
    if (!fs.existsSync(dstFile)) {
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.symlinkSync(path.relative(path.dirname(dstFile), file), dstFile);
    }
  }

  // for serverless function
  const serverlessDir = path.join(
    dstDir,
    'functions',
    config.rscPath + '.func',
  );
  fs.mkdirSync(path.join(serverlessDir, config.distDir), {
    recursive: true,
  });
  fs.symlinkSync(
    path.relative(serverlessDir, path.join(config.rootDir, 'node_modules')),
    path.join(serverlessDir, 'node_modules'),
  );
  fs.readdirSync(path.join(config.rootDir, config.distDir)).forEach((file) => {
    if (['.vercel'].includes(file)) {
      return;
    }
    fs.symlinkSync(
      path.relative(
        path.join(serverlessDir, config.distDir),
        path.join(config.rootDir, config.distDir, file),
      ),
      path.join(serverlessDir, config.distDir, file),
    );
  });
  const vcConfigJson = {
    runtime: 'nodejs18.x',
    handler: 'serve.js',
    launcherType: 'Nodejs',
  };
  fs.writeFileSync(
    path.join(serverlessDir, '.vc-config.json'),
    JSON.stringify(vcConfigJson, null, 2),
  );
  fs.writeFileSync(
    path.join(serverlessDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
  fs.writeFileSync(
    path.join(serverlessDir, 'serve.js'),
    `
export default async function handler(req, res) {
  const { rsc } = await import("waku");
  rsc({ command: "start" })(req, res, () => {
    throw new Error("not handled");
  });
}
`,
  );

  const overrides = Object.fromEntries([
    ...rscFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(srcDir, file),
        { contentType: 'text/plain' },
      ]),
    ...htmlFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(srcDir, file),
        { contentType: 'text/html' },
      ]),
  ]);
  const basePrefix = config.basePath + config.rscPath + '/';
  const routes = [{ src: basePrefix + '(.*)', dest: basePrefix }];
  const configJson = { version: 3, overrides, routes };
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(
    path.join(dstDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
};

const resolveFileName = (fname: string) => {
  for (const ext of ['.js', '.ts', '.tsx', '.jsx']) {
    const resolvedName = fname.slice(0, -path.extname(fname).length) + ext;
    if (fs.existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

export async function build(options: { cwd: string; ssr?: boolean }) {
  setCwd(options.cwd);
  const config = await resolveConfig();
  const entriesFile = resolveFileName(
    path.join(config.rootDir, config.srcDir, config.entriesJs),
  );
  const distEntriesFile = resolveFileName(
    path.join(config.rootDir, config.distDir, config.entriesJs),
  );

  const { commonEntryFiles, clientEntryFiles, serverEntryFiles } =
    await analyzeEntries(entriesFile);
  const serverBuildOutput = await buildServerBundle(
    config,
    entriesFile,
    distEntriesFile,
    commonEntryFiles,
    clientEntryFiles,
    serverEntryFiles,
  );
  const clientBuildOutput = await buildClientBundle(
    config,
    commonEntryFiles,
    clientEntryFiles,
    serverBuildOutput,
  );

  const { buildConfig, getClientModules, rscFiles } =
    await emitRscFiles(config);
  const { htmlFiles } = await emitHtmlFiles(
    config,
    buildConfig,
    getClientModules,
    !!options?.ssr,
  );

  // https://vercel.com/docs/build-output-api/v3
  emitVercelOutput(config, clientBuildOutput, rscFiles, htmlFiles);

  await shutdownSsr();
  await shutdownRsc();
}
