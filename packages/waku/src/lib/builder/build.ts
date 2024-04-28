import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as buildVite, resolveConfig as resolveViteConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { LoggingFunction, RollupLog } from 'rollup';

import type { Config } from '../../config.js';
import type { BuildConfig, EntriesPrd } from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { resolveConfig, EXTENSIONS } from '../config.js';
import type { PathSpec } from '../utils/path.js';
import {
  decodeFilePathFromAbsolute,
  extname,
  filePathToFileURL,
  fileURLToFilePath,
  joinPath,
} from '../utils/path.js';
import {
  appendFile,
  createWriteStream,
  existsSync,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from '../utils/node-fs.js';
import { encodeInput, generatePrefetchCode } from '../renderers/utils.js';
import {
  getBuildConfig,
  getSsrConfig,
  renderRsc,
  SERVER_MODULE_MAP,
} from '../renderers/rsc-renderer.js';
import {
  CLIENT_MODULE_MAP,
  CLIENT_PREFIX,
  renderHtml,
} from '../renderers/html-renderer.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscAnalyzePlugin } from '../plugins/vite-plugin-rsc-analyze.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscEntriesPlugin } from '../plugins/vite-plugin-rsc-entries.js';
import { rscServePlugin } from '../plugins/vite-plugin-rsc-serve.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import { rscManagedPlugin } from '../plugins/vite-plugin-rsc-managed.js';
import { emitVercelOutput } from './output-vercel.js';
import { emitNetlifyOutput } from './output-netlify.js';
import { emitCloudflareOutput } from './output-cloudflare.js';
import { emitPartyKitOutput } from './output-partykit.js';
import { emitAwsLambdaOutput } from './output-aws-lambda.js';

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

const analyzeEntries = async (
  rootDir: string,
  config: ResolvedConfig,
  entriesFile: string,
) => {
  const wakuClientDist = decodeFilePathFromAbsolute(
    joinPath(fileURLToFilePath(import.meta.url), '../../../client.js'),
  );
  const clientFileSet = new Set<string>([wakuClientDist]);
  const serverFileSet = new Set<string>();
  const fileHashMap = new Map<string, string>();
  const moduleFileMap = new Map<string, string>(); // module id -> full path
  for (const preserveModuleDir of config.preserveModuleDirs) {
    const dir = joinPath(rootDir, config.srcDir, preserveModuleDir);
    if (!existsSync(dir)) {
      continue;
    }
    const files = await readdir(dir, { encoding: 'utf8', recursive: true });
    for (const file of files) {
      const ext = extname(file);
      if (EXTENSIONS.includes(ext)) {
        moduleFileMap.set(
          joinPath(preserveModuleDir, file.slice(0, -ext.length)),
          joinPath(dir, file),
        );
      }
    }
  }
  await buildVite({
    plugins: [
      rscAnalyzePlugin(clientFileSet, serverFileSet, fileHashMap),
      rscManagedPlugin(config),
    ],
    ssr: {
      target: 'webworker',
      resolve: {
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
      },
      noExternal: /^(?!node:)/,
    },
    build: {
      write: false,
      ssr: true,
      target: 'node18',
      rollupOptions: {
        onwarn,
        input: {
          ...Object.fromEntries(moduleFileMap),
          entries: entriesFile,
        },
      },
    },
  });
  const clientEntryFiles = Object.fromEntries(
    Array.from(clientFileSet).map((fname, i) => [
      `${config.assetsDir}/rsc${i}-${fileHashMap.get(fname)}`,
      fname,
    ]),
  );
  const serverEntryFiles = Object.fromEntries(
    Array.from(serverFileSet).map((fname, i) => [
      `${config.assetsDir}/rsf${i}`,
      fname,
    ]),
  );
  const serverModuleFiles = Object.fromEntries(moduleFileMap);
  return {
    clientEntryFiles,
    serverEntryFiles,
    serverModuleFiles,
  };
};

// For RSC
const buildServerBundle = async (
  rootDir: string,
  config: ResolvedConfig,
  entriesFile: string,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
  serverModuleFiles: Record<string, string>,
  serve:
    | 'vercel'
    | 'netlify'
    | 'cloudflare'
    | 'partykit'
    | 'deno'
    | 'aws-lambda'
    | false,
  isNodeCompatible: boolean,
) => {
  const serverBuildOutput = await buildVite({
    plugins: [
      nonjsResolvePlugin(),
      rscTransformPlugin({
        isBuild: true,
        clientEntryFiles,
        serverEntryFiles,
      }),
      rscEnvPlugin({ config }),
      rscPrivatePlugin(config),
      rscManagedPlugin(config),
      rscEntriesPlugin({
        entriesFile,
        moduleMap: {
          ...Object.fromEntries(
            Object.keys(SERVER_MODULE_MAP).map((key) => [key, `./${key}.js`]),
          ),
          ...Object.fromEntries(
            Object.keys(CLIENT_MODULE_MAP).map((key) => [
              `${CLIENT_PREFIX}${key}`,
              `./${config.ssrDir}/${key}.js`,
            ]),
          ),
          ...Object.fromEntries(
            Object.keys(clientEntryFiles || {}).map((key) => [
              `${config.ssrDir}/${key}.js`,
              `./${config.ssrDir}/${key}.js`,
            ]),
          ),
          ...Object.fromEntries(
            Object.keys(serverEntryFiles || {}).map((key) => [
              `${key}.js`,
              `./${key}.js`,
            ]),
          ),
        },
      }),
      ...(serve
        ? [
            rscServePlugin({
              ...config,
              entriesFile,
              srcServeFile: decodeFilePathFromAbsolute(
                joinPath(
                  fileURLToFilePath(import.meta.url),
                  `../serve-${serve}.js`,
                ),
              ),
              serve,
            }),
          ]
        : []),
    ],
    ssr: isNodeCompatible
      ? {
          resolve: {
            conditions: ['react-server', 'workerd'],
            externalConditions: ['react-server', 'workerd'],
          },
          noExternal: /^(?!node:)/,
        }
      : {
          target: 'webworker',
          resolve: {
            conditions: ['react-server', 'workerd', 'worker'],
            externalConditions: ['react-server', 'workerd', 'worker'],
          },
          noExternal: /^(?!node:)/,
        },
    esbuild: {
      jsx: 'automatic',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    publicDir: false,
    build: {
      ssr: true,
      ssrEmitAssets: true,
      target: 'node18',
      outDir: joinPath(rootDir, config.distDir),
      rollupOptions: {
        onwarn,
        input: {
          entries: entriesFile,
          ...SERVER_MODULE_MAP,
          ...serverModuleFiles,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
      },
    },
  });
  if (!('output' in serverBuildOutput)) {
    throw new Error('Unexpected vite server build output');
  }
  return serverBuildOutput;
};

// For SSR (render client components on server to generate HTML)
const buildSsrBundle = async (
  rootDir: string,
  config: ResolvedConfig,
  mainJsFile: string,
  clientEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
  isNodeCompatible: boolean,
) => {
  const cssAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  await buildVite({
    base: config.basePath,
    plugins: [
      rscIndexPlugin({
        ...config,
        cssAssets,
        mainJs: mainJsFile.split('/').pop()!,
      }),
      rscEnvPlugin({ config }),
      rscPrivatePlugin(config),
      rscManagedPlugin(config),
    ],
    ssr: isNodeCompatible
      ? {
          noExternal: /^(?!node:)/,
        }
      : {
          target: 'webworker',
          resolve: {
            conditions: ['worker'],
            externalConditions: ['worker'],
          },
          noExternal: /^(?!node:)/,
        },
    esbuild: {
      jsx: 'automatic',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    publicDir: false,
    build: {
      ssr: true,
      target: 'node18',
      outDir: joinPath(rootDir, config.distDir, config.ssrDir),
      rollupOptions: {
        onwarn,
        input: {
          main: mainJsFile,
          ...clientEntryFiles,
          ...CLIENT_MODULE_MAP,
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              CLIENT_MODULE_MAP[
                chunkInfo.name as keyof typeof CLIENT_MODULE_MAP
              ] ||
              clientEntryFiles[chunkInfo.name]
            ) {
              return '[name].js';
            }
            return config.assetsDir + '/[name]-[hash].js';
          },
        },
      },
    },
  });
};

// For Browsers
const buildClientBundle = async (
  rootDir: string,
  config: ResolvedConfig,
  mainJsFile: string,
  clientEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
) => {
  const nonJsAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && !fileName.endsWith('.js') ? [fileName] : [],
  );
  const cssAssets = nonJsAssets.filter((asset) => asset.endsWith('.css'));
  const clientBuildOutput = await buildVite({
    base: config.basePath,
    plugins: [
      viteReact(),
      rscIndexPlugin({
        ...config,
        cssAssets,
        mainJs: mainJsFile.split('/').pop()!,
      }),
      rscEnvPlugin({ config }),
      rscPrivatePlugin(config),
      rscManagedPlugin(config),
    ],
    build: {
      outDir: joinPath(rootDir, config.distDir, config.publicDir),
      rollupOptions: {
        onwarn,
        input: {
          main: mainJsFile,
          // rollup will ouput the style files related to clientEntryFiles, but since it does not find any link to them in the index.html file, it will not inject them. They are only mentioned by the standalone `clientEntryFiles`
          ...clientEntryFiles,
        },
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: (chunkInfo) => {
            if (clientEntryFiles[chunkInfo.name]) {
              return '[name].js';
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
  for (const nonJsAsset of nonJsAssets) {
    const from = joinPath(rootDir, config.distDir, nonJsAsset);
    const to = joinPath(rootDir, config.distDir, config.publicDir, nonJsAsset);
    await rename(from, to);
  }
  return clientBuildOutput;
};

const emitRscFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntries: EntriesPrd,
  buildConfig: BuildConfig,
) => {
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
  const staticInputSet = new Set<string>();
  await Promise.all(
    Array.from(buildConfig).map(async ({ entries, context }) => {
      for (const { input, isStatic } of entries || []) {
        if (!isStatic) {
          continue;
        }
        if (staticInputSet.has(input)) {
          continue;
        }
        staticInputSet.add(input);
        const destRscFile = joinPath(
          rootDir,
          config.distDir,
          config.publicDir,
          config.rscPath,
          encodeInput(input),
        );
        await mkdir(joinPath(destRscFile, '..'), { recursive: true });
        const readable = await renderRsc(
          {
            input,
            searchParams: new URLSearchParams(),
            method: 'GET',
            config,
            context,
            moduleIdCallback: (id) => addClientModule(input, id),
          },
          {
            isDev: false,
            entries: distEntries,
          },
        );
        await pipeline(
          Readable.fromWeb(readable as any),
          createWriteStream(destRscFile),
        );
      }
    }),
  );
  return { getClientModules };
};

const pathname2pathSpec = (pathname: string): PathSpec =>
  pathname
    .split('/')
    .filter(Boolean)
    .map((name) => ({ type: 'literal', name }));

const pathSpec2pathname = (pathSpec: PathSpec): string => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    throw new Error(
      'Cannot convert pathSpec to pathname: ' + JSON.stringify(pathSpec),
    );
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

const emitHtmlFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntriesFile: string,
  distEntries: EntriesPrd,
  buildConfig: BuildConfig,
  getClientModules: (input: string) => string[],
  clientBuildOutput: Awaited<ReturnType<typeof buildClientBundle>>,
) => {
  const nonJsAssets = clientBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && !fileName.endsWith('.js') ? [fileName] : [],
  );
  const cssAssets = nonJsAssets.filter((asset) => asset.endsWith('.css'));
  const basePrefix = config.basePath + config.rscPath + '/';
  const publicIndexHtmlFile = joinPath(
    rootDir,
    config.distDir,
    config.publicDir,
    'index.html',
  );
  const publicIndexHtml = await readFile(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  await unlink(publicIndexHtmlFile);
  const publicIndexHtmlHead = publicIndexHtml.replace(
    /.*?<head>(.*?)<\/head>.*/s,
    '$1',
  );
  const dynamicHtmlPathMap = new Map<PathSpec, string>();
  await Promise.all(
    Array.from(buildConfig).map(
      async ({ pathname, isStatic, entries, customCode, context }) => {
        const pathSpec =
          typeof pathname === 'string' ? pathname2pathSpec(pathname) : pathname;
        let htmlStr = publicIndexHtml;
        let htmlHead = publicIndexHtmlHead;
        if (cssAssets.length) {
          const cssStr = cssAssets
            .map((asset) => `<link rel="stylesheet" href="${asset}">`)
            .join('\n');
          // HACK is this too naive to inject style code?
          htmlStr = htmlStr.replace(/<\/head>/, cssStr);
          htmlHead += cssStr;
        }
        const inputsForPrefetch = new Set<string>();
        const moduleIdsForPrefetch = new Set<string>();
        for (const { input, skipPrefetch } of entries || []) {
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
            `<script type="module" async>${code}</script></head>`,
          );
          htmlHead += `<script type="module" async>${code}</script>`;
        }
        if (!isStatic) {
          dynamicHtmlPathMap.set(pathSpec, htmlHead);
          return;
        }
        pathname = pathSpec2pathname(pathSpec);
        const destHtmlFile = joinPath(
          rootDir,
          config.distDir,
          config.publicDir,
          extname(pathname)
            ? pathname
            : pathname === '/404'
              ? '404.html' // HACK special treatment for 404, better way?
              : pathname + '/index.html',
        );
        const htmlReadable = await renderHtml({
          config,
          pathname,
          searchParams: new URLSearchParams(),
          htmlHead,
          renderRscForHtml: (input, searchParams) =>
            renderRsc(
              {
                config,
                input,
                searchParams,
                method: 'GET',
                context,
              },
              {
                isDev: false,
                entries: distEntries,
              },
            ),
          getSsrConfigForHtml: (pathname, searchParams) =>
            getSsrConfig(
              {
                config,
                pathname,
                searchParams,
              },
              {
                isDev: false,
                entries: distEntries,
              },
            ),
          isDev: false,
          loadModule: distEntries.loadModule,
        });
        await mkdir(joinPath(destHtmlFile, '..'), { recursive: true });
        if (htmlReadable) {
          await pipeline(
            Readable.fromWeb(htmlReadable as any),
            createWriteStream(destHtmlFile),
          );
        } else {
          await writeFile(destHtmlFile, htmlStr);
        }
      },
    ),
  );
  const dynamicHtmlPaths = Array.from(dynamicHtmlPathMap);
  const code = `
export const dynamicHtmlPaths = ${JSON.stringify(dynamicHtmlPaths)};
export const publicIndexHtml = ${JSON.stringify(publicIndexHtml)};
`;
  await appendFile(distEntriesFile, code);
};

const resolveFileName = (fname: string) => {
  for (const ext of EXTENSIONS) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

export async function build(options: {
  config: Config;
  env?: Record<string, string>;
  deploy?:
    | 'vercel-static'
    | 'vercel-serverless'
    | 'netlify-static'
    | 'netlify-functions'
    | 'cloudflare'
    | 'partykit'
    | 'deno'
    | 'aws-lambda'
    | undefined;
}) {
  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const config = await resolveConfig(options.config);
  const rootDir = (
    await resolveViteConfig({}, 'build', 'production', 'production')
  ).root;
  const entriesFile = resolveFileName(
    joinPath(rootDir, config.srcDir, config.entriesJs),
  );
  const distEntriesFile = resolveFileName(
    joinPath(rootDir, config.distDir, config.entriesJs),
  );
  const mainJsFile = resolveFileName(
    joinPath(rootDir, config.srcDir, config.mainJs),
  );
  const isNodeCompatible =
    options.deploy !== 'cloudflare' &&
    options.deploy !== 'partykit' &&
    options.deploy !== 'deno';

  const { clientEntryFiles, serverEntryFiles, serverModuleFiles } =
    await analyzeEntries(rootDir, config, entriesFile);
  const serverBuildOutput = await buildServerBundle(
    rootDir,
    config,
    entriesFile,
    clientEntryFiles,
    serverEntryFiles,
    serverModuleFiles,
    (options.deploy === 'vercel-serverless' ? 'vercel' : false) ||
      (options.deploy === 'netlify-functions' ? 'netlify' : false) ||
      (options.deploy === 'cloudflare' ? 'cloudflare' : false) ||
      (options.deploy === 'partykit' ? 'partykit' : false) ||
      (options.deploy === 'deno' ? 'deno' : false) ||
      (options.deploy === 'aws-lambda' ? 'aws-lambda' : false),
    isNodeCompatible,
  );
  await buildSsrBundle(
    rootDir,
    config,
    mainJsFile,
    clientEntryFiles,
    serverBuildOutput,
    isNodeCompatible,
  );
  const clientBuildOutput = await buildClientBundle(
    rootDir,
    config,
    mainJsFile,
    clientEntryFiles,
    serverBuildOutput,
  );

  const distEntries = await import(filePathToFileURL(distEntriesFile));
  const buildConfig = await getBuildConfig({ config, entries: distEntries });
  await appendFile(
    distEntriesFile,
    `export const buildConfig = ${JSON.stringify(buildConfig)};`,
  );
  const { getClientModules } = await emitRscFiles(
    rootDir,
    config,
    distEntries,
    buildConfig,
  );
  await emitHtmlFiles(
    rootDir,
    config,
    distEntriesFile,
    distEntries,
    buildConfig,
    getClientModules,
    clientBuildOutput,
  );

  if (options.deploy?.startsWith('vercel-')) {
    await emitVercelOutput(
      rootDir,
      config,
      options.deploy.slice('vercel-'.length) as 'static' | 'serverless',
    );
  } else if (options.deploy?.startsWith('netlify-')) {
    await emitNetlifyOutput(
      rootDir,
      config,
      options.deploy.slice('netlify-'.length) as 'static' | 'functions',
    );
  } else if (options.deploy === 'cloudflare') {
    await emitCloudflareOutput(rootDir, config);
  } else if (options.deploy === 'partykit') {
    await emitPartyKitOutput(rootDir, config);
  } else if (options.deploy === 'aws-lambda') {
    await emitAwsLambdaOutput(config);
  }
}
