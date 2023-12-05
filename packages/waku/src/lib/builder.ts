import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as viteBuild } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { RollupLog, LoggingFunction } from 'rollup';

import type { Config, ResolvedConfig } from '../config.js';
import { resolveConfig, viteInlineConfig } from './config.js';
import { joinPath, extname } from './utils/path.js';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  rename,
  mkdir,
  readFile,
  writeFile,
} from './utils/node-fs.js';
import { streamToString } from './utils/stream.js';
import { encodeInput, generatePrefetchCode } from './middleware/rsc/utils.js';
import { renderRSC, getBuildConfigRSC } from './rsc/renderer.js';
import { rscIndexPlugin } from './vite-plugin/rsc-index-plugin.js';
import { rscAnalyzePlugin } from './vite-plugin/rsc-analyze-plugin.js';
import { rscTransformPlugin } from './vite-plugin/rsc-transform-plugin.js';
import { patchReactRefresh } from './vite-plugin/patch-react-refresh.js';
import { renderHtml, shutdown as shutdownSsr } from './middleware/rsc/ssr.js';

// TODO this file and functions in it are too long. will fix.

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
    createReadStream(fname).pipe(sha256);
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
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
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
  config: ResolvedConfig,
  entriesFile: string,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
) => {
  const serverBuildOutput = await viteBuild({
    ...(await viteInlineConfig()),
    plugins: [rscTransformPlugin(true)],
    ssr: {
      resolve: {
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
      },
      noExternal: /^(?!node:)/,
    },
    publicDir: false,
    build: {
      ssr: true,
      ssrEmitAssets: true,
      outDir: joinPath(config.rootDir, config.distDir),
      rollupOptions: {
        onwarn,
        input: {
          entries: entriesFile,
          'rsdw-server': 'react-server-dom-webpack/server.edge',
          'waku-client': 'waku/client',
          ...commonEntryFiles,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              ['waku-client'].includes(chunkInfo.name) ||
              commonEntryFiles[chunkInfo.name] ||
              clientEntryFiles[chunkInfo.name] ||
              serverEntryFiles[chunkInfo.name]
            ) {
              return config.assetsDir + '/[name].js';
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
  return serverBuildOutput;
};

const buildClientBundle = async (
  config: ResolvedConfig,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
) => {
  const indexHtmlFile = joinPath(
    config.rootDir,
    config.srcDir,
    config.indexHtml,
  );
  const cssAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  const clientBuildOutput = await viteBuild({
    ...(await viteInlineConfig()),
    root: joinPath(config.rootDir, config.srcDir),
    base: config.basePath,
    plugins: [patchReactRefresh(viteReact()), rscIndexPlugin(cssAssets)],
    build: {
      outDir: joinPath(config.rootDir, config.distDir, config.publicDir),
      rollupOptions: {
        onwarn,
        input: {
          main: indexHtmlFile,
          react: 'react',
          'rd-server': 'react-dom/server.edge',
          'rsdw-client': 'react-server-dom-webpack/client.edge',
          'waku-client': 'waku/client',
          ...commonEntryFiles,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              ['react', 'rd-server', 'rsdw-client', 'waku-client'].includes(
                chunkInfo.name,
              ) ||
              commonEntryFiles[chunkInfo.name] ||
              clientEntryFiles[chunkInfo.name]
            ) {
              return config.assetsDir + '/[name].js';
            }
            return config.assetsDir + '/[name]-[hash].js';
          },
        },
      },
    },
  });
  if (!('output' in clientBuildOutput)) {
    throw new Error('Unexpected vite client build output');
  }
  for (const cssAsset of cssAssets) {
    const from = joinPath(config.rootDir, config.distDir, cssAsset);
    const to = joinPath(
      config.rootDir,
      config.distDir,
      config.publicDir,
      cssAsset,
    );
    await rename(from, to);
  }
  return clientBuildOutput;
};

const emitRscFiles = async (config: ResolvedConfig) => {
  const buildConfig = await getBuildConfigRSC({ config });
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
        const destRscFile = joinPath(
          config.rootDir,
          config.distDir,
          config.publicDir,
          config.rscPath,
          encodeInput(
            // Should we do this here? Or waku/router or in entries.ts?
            input.split('\\').join('/'),
          ),
        );
        if (!rscFileSet.has(destRscFile)) {
          rscFileSet.add(destRscFile);
          await mkdir(joinPath(destRscFile, '..'), { recursive: true });
          const readable = await renderRSC({
            input,
            method: 'GET',
            config,
            context,
            moduleIdCallback: (id) => addClientModule(input, id),
            isDev: false,
          });
          await pipeline(
            Readable.fromWeb(readable as any),
            createWriteStream(destRscFile),
          );
        }
      }
    }),
  );
  return { buildConfig, getClientModules, rscFiles: Array.from(rscFileSet) };
};

const emitHtmlFiles = async (
  config: ResolvedConfig,
  buildConfig: Awaited<ReturnType<typeof getBuildConfigRSC>>,
  getClientModules: (input: string) => string[],
  ssr: boolean,
) => {
  const basePrefix = config.basePath + config.rscPath + '/';
  const publicIndexHtmlFile = joinPath(
    config.rootDir,
    config.distDir,
    config.publicDir,
    config.indexHtml,
  );
  const publicIndexHtml = await readFile(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  const publicIndexHtmlJsFile = joinPath(
    config.rootDir,
    config.distDir,
    config.htmlsDir,
    config.indexHtml + '.js',
  );
  await mkdir(joinPath(publicIndexHtmlJsFile, '..'), { recursive: true });
  await writeFile(
    publicIndexHtmlJsFile,
    `export default ${JSON.stringify(publicIndexHtml)};`,
  );
  const htmlFiles = await Promise.all(
    Object.entries(buildConfig).map(
      async ([pathStr, { entries, customCode, context }]) => {
        const destHtmlFile = joinPath(
          config.rootDir,
          config.distDir,
          config.publicDir,
          pathStr.endsWith('/') ? pathStr + 'index.html' : pathStr,
        );
        const destHtmlJsFile = joinPath(
          config.rootDir,
          config.distDir,
          config.htmlsDir,
          pathStr.endsWith('/') ? pathStr + 'index.html.js' : pathStr + '.js',
        );
        let htmlStr: string;
        if (existsSync(destHtmlFile)) {
          htmlStr = await readFile(destHtmlFile, { encoding: 'utf8' });
        } else {
          await mkdir(joinPath(destHtmlFile, '..'), { recursive: true });
          htmlStr = publicIndexHtml;
        }
        await mkdir(joinPath(destHtmlJsFile, '..'), { recursive: true });
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
          const [htmlReadable1, htmlReadable2] = htmlResult[0].tee();
          await Promise.all([
            pipeline(
              Readable.fromWeb(htmlReadable1 as any),
              createWriteStream(destHtmlFile),
            ),
            streamToString(htmlReadable2).then((str) =>
              writeFile(
                destHtmlJsFile,
                `export default ${JSON.stringify(str)};`,
              ),
            ),
          ]);
        } else {
          await Promise.all([
            writeFile(destHtmlFile, htmlStr),
            writeFile(
              destHtmlJsFile,
              `export default ${JSON.stringify(htmlStr)};`,
            ),
          ]);
        }
        return destHtmlFile;
      },
    ),
  );
  return { htmlFiles };
};

const emitVercelOutput = async (
  config: ResolvedConfig,
  clientBuildOutput: Awaited<ReturnType<typeof buildClientBundle>>,
  rscFiles: string[],
  htmlFiles: string[],
) => {
  // FIXME somehow utils/(path,node-fs).ts doesn't work
  const [
    path,
    { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync },
  ] = await Promise.all([import('node:path'), import('node:fs')]);
  const clientFiles = clientBuildOutput.output.map(({ fileName }) =>
    path.join(config.rootDir, config.distDir, config.publicDir, fileName),
  );
  const srcDir = path.join(config.rootDir, config.distDir, config.publicDir);
  const dstDir = path.join(config.rootDir, config.distDir, '.vercel', 'output');
  for (const file of [...clientFiles, ...rscFiles, ...htmlFiles]) {
    const dstFile = path.join(dstDir, 'static', path.relative(srcDir, file));
    if (!existsSync(dstFile)) {
      mkdirSync(path.dirname(dstFile), { recursive: true });
      symlinkSync(path.relative(path.dirname(dstFile), file), dstFile);
    }
  }

  // for serverless function
  const serverlessDir = path.join(
    dstDir,
    'functions',
    config.rscPath + '.func',
  );
  mkdirSync(path.join(serverlessDir, config.distDir), {
    recursive: true,
  });
  symlinkSync(
    path.relative(serverlessDir, path.join(config.rootDir, 'node_modules')),
    path.join(serverlessDir, 'node_modules'),
  );
  for (const file of readdirSync(path.join(config.rootDir, config.distDir))) {
    if (['.vercel'].includes(file)) {
      continue;
    }
    symlinkSync(
      path.relative(
        path.join(serverlessDir, config.distDir),
        path.join(config.rootDir, config.distDir, file),
      ),
      path.join(serverlessDir, config.distDir, file),
    );
  }
  const vcConfigJson = {
    runtime: 'nodejs18.x',
    handler: 'serve.js',
    launcherType: 'Nodejs',
  };
  writeFileSync(
    path.join(serverlessDir, '.vc-config.json'),
    JSON.stringify(vcConfigJson, null, 2),
  );
  writeFileSync(
    path.join(serverlessDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
  writeFileSync(
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
  mkdirSync(dstDir, { recursive: true });
  writeFileSync(
    path.join(dstDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
};

const resolveFileName = (fname: string) => {
  for (const ext of ['.js', '.ts', '.tsx', '.jsx']) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

export async function build(options: { config: Config; ssr?: boolean }) {
  const config = await resolveConfig(options.config);
  const entriesFile = resolveFileName(
    joinPath(config.rootDir, config.srcDir, config.entriesJs),
  );

  const { commonEntryFiles, clientEntryFiles, serverEntryFiles } =
    await analyzeEntries(entriesFile);
  const serverBuildOutput = await buildServerBundle(
    config,
    entriesFile,
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
  await emitVercelOutput(config, clientBuildOutput, rscFiles, htmlFiles);

  await shutdownSsr();
}
