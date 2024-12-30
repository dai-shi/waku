import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as buildVite, resolveConfig as resolveViteConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { LoggingFunction, RollupLog } from 'rollup';
import type { ReactNode } from 'react';

import type { Config } from '../../config.js';
import { setAllEnvInternal, unstable_getPlatformObject } from '../../server.js';
import type { EntriesPrd } from '../types.js';
import type { ResolvedConfig } from '../config.js';
import { resolveConfig } from '../config.js';
import { EXTENSIONS } from '../constants.js';
import type { PathSpec } from '../utils/path.js';
import {
  decodeFilePathFromAbsolute,
  extname,
  filePathToFileURL,
  fileURLToFilePath,
  joinPath,
} from '../utils/path.js';
import { extendViteConfig } from '../utils/vite-config.js';
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
import { encodeRscPath, generatePrefetchCode } from '../renderers/utils.js';
import { collectClientModules, renderRsc } from '../renderers/rsc.js';
import { renderHtml } from '../renderers/html.js';
import {
  SERVER_MODULE_MAP,
  CLIENT_MODULE_MAP,
  CLIENT_PREFIX,
} from '../middleware/handler.js';
import { rscRsdwPlugin } from '../plugins/vite-plugin-rsc-rsdw.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscAnalyzePlugin } from '../plugins/vite-plugin-rsc-analyze.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscEntriesPlugin } from '../plugins/vite-plugin-rsc-entries.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import { rscManagedPlugin } from '../plugins/vite-plugin-rsc-managed.js';
import {
  DIST_ENTRIES_JS,
  DIST_PUBLIC,
  DIST_ASSETS,
  DIST_SSR,
} from './constants.js';
import { deployVercelPlugin } from '../plugins/vite-plugin-deploy-vercel.js';
import { deployNetlifyPlugin } from '../plugins/vite-plugin-deploy-netlify.js';
import { deployCloudflarePlugin } from '../plugins/vite-plugin-deploy-cloudflare.js';
import { deployDenoPlugin } from '../plugins/vite-plugin-deploy-deno.js';
import { deployPartykitPlugin } from '../plugins/vite-plugin-deploy-partykit.js';
import { deployAwsLambdaPlugin } from '../plugins/vite-plugin-deploy-aws-lambda.js';

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
    warning.loc?.column === 0 &&
    warning.loc?.line === 1
  ) {
    return;
  }
  defaultHandler(warning);
};

const deployPlugins = (config: ResolvedConfig) => [
  deployVercelPlugin(config),
  deployNetlifyPlugin(config),
  deployCloudflarePlugin(config),
  deployDenoPlugin(config),
  deployPartykitPlugin(config),
  deployAwsLambdaPlugin(config),
];

const analyzeEntries = async (rootDir: string, config: ResolvedConfig) => {
  const wakuClientDist = decodeFilePathFromAbsolute(
    joinPath(fileURLToFilePath(import.meta.url), '../../../client.js'),
  );
  const wakuMinimalClientDist = decodeFilePathFromAbsolute(
    joinPath(fileURLToFilePath(import.meta.url), '../../../minimal/client.js'),
  );
  const clientFileSet = new Set<string>([
    wakuClientDist,
    wakuMinimalClientDist,
  ]);
  const serverFileSet = new Set<string>();
  const fileHashMap = new Map<string, string>();
  const moduleFileMap = new Map<string, string>(); // module id -> full path
  const pagesDirPath = joinPath(rootDir, config.srcDir, config.pagesDir);
  if (existsSync(pagesDirPath)) {
    const files = await readdir(pagesDirPath, {
      encoding: 'utf8',
      recursive: true,
    });
    for (const file of files) {
      const ext = extname(file);
      if (EXTENSIONS.includes(ext)) {
        moduleFileMap.set(
          joinPath(config.pagesDir, file.slice(0, -ext.length)),
          joinPath(pagesDirPath, file),
        );
      }
    }
  }
  await buildVite(
    extendViteConfig(
      {
        mode: 'production',
        plugins: [
          rscAnalyzePlugin({
            isClient: false,
            clientFileSet,
            serverFileSet,
            fileHashMap,
          }),
          rscManagedPlugin({ ...config, addEntriesToInput: true }),
          ...deployPlugins(config),
        ],
        ssr: {
          target: 'webworker',
          resolve: {
            conditions: ['react-server'],
            externalConditions: ['react-server'],
          },
          noExternal: /^(?!node:)/,
        },
        build: {
          write: false,
          ssr: true,
          target: 'node18',
          rollupOptions: {
            onwarn,
            input: Object.fromEntries(moduleFileMap),
          },
        },
      },
      config,
      'build-analyze',
    ),
  );
  const clientEntryFiles = Object.fromEntries(
    Array.from(clientFileSet).map((fname, i) => [
      `${DIST_ASSETS}/rsc${i}-${fileHashMap.get(fname) || 'lib'}`, // FIXME 'lib' is a workaround to avoid `undefined`
      fname,
    ]),
  );
  await buildVite(
    extendViteConfig(
      {
        mode: 'production',
        plugins: [
          rscAnalyzePlugin({ isClient: true, serverFileSet }),
          rscManagedPlugin(config),
          ...deployPlugins(config),
        ],
        ssr: {
          target: 'webworker',
          noExternal: /^(?!node:)/,
        },
        build: {
          write: false,
          ssr: true,
          target: 'node18',
          rollupOptions: {
            onwarn,
            input: clientEntryFiles,
          },
        },
      },
      config,
      'build-analyze',
    ),
  );
  const serverEntryFiles = Object.fromEntries(
    Array.from(serverFileSet).map((fname, i) => [
      `${DIST_ASSETS}/rsf${i}`,
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
  env: Record<string, string>,
  config: ResolvedConfig,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
  serverModuleFiles: Record<string, string>,
  partial: boolean,
) => {
  const serverBuildOutput = await buildVite(
    extendViteConfig(
      {
        mode: 'production',
        plugins: [
          nonjsResolvePlugin(),
          rscTransformPlugin({
            isClient: false,
            isBuild: true,
            clientEntryFiles,
            serverEntryFiles,
          }),
          rscRsdwPlugin(),
          rscEnvPlugin({ isDev: false, env, config }),
          rscPrivatePlugin(config),
          rscManagedPlugin({
            ...config,
            addEntriesToInput: true,
          }),
          rscEntriesPlugin({
            srcDir: config.srcDir,
            ssrDir: DIST_SSR,
            moduleMap: {
              ...Object.fromEntries(
                Object.keys(SERVER_MODULE_MAP).map((key) => [
                  key,
                  `./${key}.js`,
                ]),
              ),
              ...Object.fromEntries(
                Object.keys(CLIENT_MODULE_MAP).map((key) => [
                  `${CLIENT_PREFIX}${key}`,
                  `./${DIST_SSR}/${key}.js`,
                ]),
              ),
              ...Object.fromEntries(
                Object.keys(clientEntryFiles || {}).map((key) => [
                  `${DIST_SSR}/${key}.js`,
                  `./${DIST_SSR}/${key}.js`,
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
          ...deployPlugins(config),
        ],
        ssr: {
          resolve: {
            conditions: ['react-server'],
            externalConditions: ['react-server'],
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
          emptyOutDir: !partial,
          ssr: true,
          ssrEmitAssets: true,
          target: 'node18',
          outDir: joinPath(rootDir, config.distDir),
          rollupOptions: {
            onwarn,
            input: {
              ...SERVER_MODULE_MAP,
              ...serverModuleFiles,
              ...clientEntryFiles,
              ...serverEntryFiles,
            },
          },
        },
      },
      config,
      'build-server',
    ),
  );
  if (!('output' in serverBuildOutput)) {
    throw new Error('Unexpected vite server build output');
  }
  return serverBuildOutput;
};

// For SSR (render client components on server to generate HTML)
const buildSsrBundle = async (
  rootDir: string,
  env: Record<string, string>,
  config: ResolvedConfig,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
  partial: boolean,
) => {
  const cssAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  await buildVite(
    extendViteConfig(
      {
        mode: 'production',
        base: config.basePath,
        plugins: [
          rscRsdwPlugin(),
          rscIndexPlugin({ ...config, cssAssets }),
          rscEnvPlugin({ isDev: false, env, config }),
          rscPrivatePlugin(config),
          rscManagedPlugin({ ...config, addMainToInput: true }),
          rscTransformPlugin({
            isClient: true,
            isBuild: true,
            serverEntryFiles,
          }),
          ...deployPlugins(config),
        ],
        ssr: {
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
          emptyOutDir: !partial,
          ssr: true,
          target: 'node18',
          outDir: joinPath(rootDir, config.distDir, DIST_SSR),
          rollupOptions: {
            onwarn,
            input: {
              ...clientEntryFiles,
              ...CLIENT_MODULE_MAP,
            },
            output: {
              entryFileNames: (chunkInfo: { name: string }) => {
                if (
                  CLIENT_MODULE_MAP[
                    chunkInfo.name as keyof typeof CLIENT_MODULE_MAP
                  ] ||
                  clientEntryFiles[chunkInfo.name]
                ) {
                  return '[name].js';
                }
                return DIST_ASSETS + '/[name]-[hash].js';
              },
            },
          },
        },
      },
      config,
      'build-ssr',
    ),
  );
};

// For Browsers
const buildClientBundle = async (
  rootDir: string,
  env: Record<string, string>,
  config: ResolvedConfig,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
  partial: boolean,
) => {
  const nonJsAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && !fileName.endsWith('.js') ? [fileName] : [],
  );
  const cssAssets = nonJsAssets.filter((asset) => asset.endsWith('.css'));
  const clientBuildOutput = await buildVite(
    extendViteConfig(
      {
        mode: 'production',
        base: config.basePath,
        plugins: [
          viteReact(),
          rscRsdwPlugin(),
          rscIndexPlugin({ ...config, cssAssets }),
          rscEnvPlugin({ isDev: false, env, config }),
          rscPrivatePlugin(config),
          rscManagedPlugin({ ...config, addMainToInput: true }),
          rscTransformPlugin({
            isClient: true,
            isBuild: true,
            serverEntryFiles,
          }),
          ...deployPlugins(config),
        ],
        build: {
          emptyOutDir: !partial,
          outDir: joinPath(rootDir, config.distDir, DIST_PUBLIC),
          rollupOptions: {
            onwarn,
            // rollup will ouput the style files related to clientEntryFiles, but since it does not find any link to them in the index.html file, it will not inject them. They are only mentioned by the standalone `clientEntryFiles`
            input: clientEntryFiles,
            preserveEntrySignatures: 'exports-only',
            output: {
              entryFileNames: (chunkInfo: { name: string }) => {
                if (clientEntryFiles[chunkInfo.name]) {
                  return '[name].js';
                }
                return DIST_ASSETS + '/[name]-[hash].js';
              },
            },
          },
        },
      },
      config,
      'build-client',
    ),
  );
  if (!('output' in clientBuildOutput)) {
    throw new Error('Unexpected vite client build output');
  }
  for (const nonJsAsset of nonJsAssets) {
    const from = joinPath(rootDir, config.distDir, nonJsAsset);
    const to = joinPath(rootDir, config.distDir, DIST_PUBLIC, nonJsAsset);
    await rename(from, to);
  }
  return clientBuildOutput;
};

// TODO: Add progress indication for static builds.

const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const errors: unknown[] = [];
  const scheduleTask = async (task: () => Promise<void>) => {
    if (running >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    try {
      await task();
    } catch (err) {
      errors.push(err);
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  const runTask = (task: () => Promise<void>) => {
    scheduleTask(task).catch(() => {});
  };
  const waitForTasks = async () => {
    if (running > 0) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      await waitForTasks();
    }
    if (errors.length > 0) {
      console.error('Errors occurred during running tasks:', errors);
      throw errors[0];
    }
  };
  return { runTask, waitForTasks };
};
const WRITE_FILE_BATCH_SIZE = 2500;
const { runTask, waitForTasks } = createTaskRunner(WRITE_FILE_BATCH_SIZE);

const emitStaticFile = (
  rootDir: string,
  config: ResolvedConfig,
  pathname: string,
  body: Promise<ReadableStream> | string,
) => {
  const destFile = joinPath(
    rootDir,
    config.distDir,
    DIST_PUBLIC,
    extname(pathname)
      ? pathname
      : pathname === '/404'
        ? '404.html' // HACK special treatment for 404, better way?
        : pathname + '/index.html',
  );
  // In partial mode, skip if the file already exists.
  if (existsSync(destFile)) {
    return;
  }
  runTask(async () => {
    await mkdir(joinPath(destFile, '..'), { recursive: true });
    if (typeof body === 'string') {
      await writeFile(destFile, body);
    } else {
      await pipeline(
        Readable.fromWeb((await body) as never),
        createWriteStream(destFile),
      );
    }
  });
};

const emitStaticFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntriesFile: string,
  distEntries: EntriesPrd,
  cssAssets: string[],
) => {
  const unstable_modules = {
    rsdwServer: await distEntries.loadModule('rsdw-server'),
    rdServer: await distEntries.loadModule(CLIENT_PREFIX + 'rd-server'),
    rsdwClient: await distEntries.loadModule(CLIENT_PREFIX + 'rsdw-client'),
    wakuMinimalClient: await distEntries.loadModule(
      CLIENT_PREFIX + 'waku-minimal-client',
    ),
  };
  const publicIndexHtmlFile = joinPath(
    rootDir,
    config.distDir,
    DIST_PUBLIC,
    'index.html',
  );
  const publicIndexHtml = await readFile(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  const publicIndexHtmlHead = publicIndexHtml.replace(
    /.*?<head>(.*?)<\/head>.*/s,
    '$1',
  );
  const cssStr = cssAssets
    .map((asset) => `<link rel="stylesheet" href="${config.basePath}${asset}">`)
    .join('\n');
  const defaultHtmlStr = publicIndexHtml
    // HACK is this too naive to inject style code?
    .replace(/<\/head>/, cssStr + '</head>');
  const defaultHtmlHead = publicIndexHtmlHead + cssStr;
  const baseRscPrefix = config.basePath + config.rscBase + '/';
  const utils = {
    renderRsc: (
      elements: Record<string, unknown>,
      options?: {
        moduleIdCallback?: (id: string) => void;
      },
    ) =>
      renderRsc(
        config,
        { unstable_modules },
        elements,
        options?.moduleIdCallback,
      ),
    renderHtml: async (
      elements: Record<string, ReactNode>,
      html: ReactNode,
      options: { rscPath: string; htmlHead?: string },
    ) => {
      const body = await renderHtml(
        config,
        { unstable_modules },
        defaultHtmlHead + (options.htmlHead || ''),
        elements,
        html,
        options.rscPath,
      );
      const headers = { 'content-type': 'text/html; charset=utf-8' };
      return { body, headers };
    },
    rscPath2pathname: (rscPath: string) =>
      joinPath(config.rscBase, encodeRscPath(rscPath)),
    unstable_generatePrefetchCode: (
      rscPaths: Iterable<string>,
      moduleIds: Iterable<string>,
    ) => generatePrefetchCode(baseRscPrefix, rscPaths, moduleIds),
    unstable_collectClientModules: (elements: Record<string, unknown>) =>
      collectClientModules(
        config,
        unstable_modules.rsdwServer as never,
        elements,
      ),
  };
  const dynamicHtmlPathMap = new Map<PathSpec, string>();
  const buildConfigs = distEntries.default.handleBuild(utils);
  if (buildConfigs) {
    await unlink(publicIndexHtmlFile);
  }
  for await (const buildConfig of buildConfigs || []) {
    switch (buildConfig.type) {
      case 'file':
        emitStaticFile(rootDir, config, buildConfig.pathname, buildConfig.body);
        break;
      case 'htmlHead':
        dynamicHtmlPathMap.set(
          buildConfig.pathSpec,
          defaultHtmlHead + (buildConfig.head || ''),
        );
        break;
      case 'defaultHtml':
        emitStaticFile(
          rootDir,
          config,
          buildConfig.pathname,
          // HACK is this too naive to inject script code?
          defaultHtmlStr.replace(
            /<\/head>/,
            (buildConfig.head || '') + '</head>',
          ),
        );
        break;
    }
  }
  await waitForTasks();
  const dynamicHtmlPaths = Array.from(dynamicHtmlPathMap);
  const code = `
export const dynamicHtmlPaths = ${JSON.stringify(dynamicHtmlPaths)};
export const publicIndexHtml = ${JSON.stringify(publicIndexHtml)};
`;
  await appendFile(distEntriesFile, code);
};

// For Deploy
// FIXME Is this a good approach? I wonder if there's something missing.
const buildDeploy = async (rootDir: string, config: ResolvedConfig) => {
  const DUMMY = 'dummy-entry';
  await buildVite({
    plugins: [
      {
        // FIXME This is too hacky. There must be a better way.
        name: 'dummy-entry-plugin',
        resolveId(source) {
          if (source === DUMMY) {
            return source;
          }
        },
        load(id) {
          if (id === DUMMY) {
            return '';
          }
        },
        generateBundle(_options, bundle) {
          Object.entries(bundle).forEach(([key, value]) => {
            if (value.name === DUMMY) {
              delete bundle[key];
            }
          });
        },
      },
      ...deployPlugins(config),
    ],
    publicDir: false,
    build: {
      emptyOutDir: false,
      ssr: true,
      rollupOptions: {
        onwarn: (warning, warn) => {
          if (!warning.message.startsWith('Generated an empty chunk:')) {
            warn(warning);
          }
        },
        input: { [DUMMY]: DUMMY },
      },
      outDir: joinPath(rootDir, config.distDir),
    },
  });
};

export async function build(options: {
  config: Config;
  env?: Record<string, string>;
  partial?: boolean;
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
  const env = options.env || {};
  const config = await resolveConfig(options.config);
  const rootDir = (
    await resolveViteConfig({}, 'build', 'production', 'production')
  ).root;
  const distEntriesFile = joinPath(rootDir, config.distDir, DIST_ENTRIES_JS);

  const platformObject = unstable_getPlatformObject();
  platformObject.buildOptions ||= {};
  platformObject.buildOptions.deploy = options.deploy;

  platformObject.buildOptions.unstable_phase = 'analyzeEntries';
  const { clientEntryFiles, serverEntryFiles, serverModuleFiles } =
    await analyzeEntries(rootDir, config);
  platformObject.buildOptions.unstable_phase = 'buildServerBundle';
  const serverBuildOutput = await buildServerBundle(
    rootDir,
    env,
    config,
    clientEntryFiles,
    serverEntryFiles,
    serverModuleFiles,
    !!options.partial,
  );
  platformObject.buildOptions.unstable_phase = 'buildSsrBundle';
  await buildSsrBundle(
    rootDir,
    env,
    config,
    clientEntryFiles,
    serverEntryFiles,
    serverBuildOutput,
    !!options.partial,
  );
  platformObject.buildOptions.unstable_phase = 'buildClientBundle';
  const clientBuildOutput = await buildClientBundle(
    rootDir,
    env,
    config,
    clientEntryFiles,
    serverEntryFiles,
    serverBuildOutput,
    !!options.partial,
  );
  delete platformObject.buildOptions.unstable_phase;

  const distEntries: EntriesPrd = await import(
    filePathToFileURL(distEntriesFile)
  );

  setAllEnvInternal(env);
  const cssAssets = clientBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  await emitStaticFiles(
    rootDir,
    config,
    distEntriesFile,
    distEntries,
    cssAssets,
  );

  platformObject.buildOptions.unstable_phase = 'buildDeploy';
  await buildDeploy(rootDir, config);
  delete platformObject.buildOptions.unstable_phase;

  if (existsSync(distEntriesFile)) {
    await appendFile(
      distEntriesFile,
      `export const buildData = ${JSON.stringify(platformObject.buildData)};`,
    );
  }
}
