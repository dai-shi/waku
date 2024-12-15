import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as buildVite, resolveConfig as resolveViteConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { LoggingFunction, RollupLog } from 'rollup';
import type { ReactNode } from 'react';

import type { Config } from '../../config.js';
import { setAllEnvInternal, unstable_getPlatformObject } from '../../server.js';
import type { BuildConfig, EntriesPrd } from '../types.js';
import type { ResolvedConfig } from '../config.js';
import { resolveConfig } from '../config.js';
import { EXTENSIONS } from '../constants.js';
import { stringToStream } from '../utils/stream.js';
import type { PathSpec } from '../utils/path.js';
import {
  decodeFilePathFromAbsolute,
  extname,
  filePathToFileURL,
  fileURLToFilePath,
  getPathMapping,
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
  });
  const clientEntryFiles = Object.fromEntries(
    Array.from(clientFileSet).map((fname, i) => [
      `${DIST_ASSETS}/rsc${i}-${fileHashMap.get(fname) || 'lib'}`, // FIXME 'lib' is a workaround to avoid `undefined`
      fname,
    ]),
  );
  await buildVite({
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
  });
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
  const serverBuildOutput = await buildVite({
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
            Object.keys(SERVER_MODULE_MAP).map((key) => [key, `./${key}.js`]),
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
      external: ['waku/middleware/context'],
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
  });
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
  await buildVite({
    base: config.basePath,
    plugins: [
      rscRsdwPlugin(),
      rscIndexPlugin({
        ...config,
        cssAssets,
      }),
      rscEnvPlugin({ isDev: false, env, config }),
      rscPrivatePlugin(config),
      rscManagedPlugin({ ...config, addMainToInput: true }),
      rscTransformPlugin({ isClient: true, isBuild: true, serverEntryFiles }),
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
          entryFileNames: (chunkInfo) => {
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
  });
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
  const clientBuildOutput = await buildVite({
    base: config.basePath,
    plugins: [
      viteReact(),
      rscRsdwPlugin(),
      rscIndexPlugin({
        ...config,
        cssAssets,
      }),
      rscEnvPlugin({ isDev: false, env, config }),
      rscPrivatePlugin(config),
      rscManagedPlugin({ ...config, addMainToInput: true }),
      rscTransformPlugin({ isClient: true, isBuild: true, serverEntryFiles }),
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
          entryFileNames: (chunkInfo) => {
            if (clientEntryFiles[chunkInfo.name]) {
              return '[name].js';
            }
            return DIST_ASSETS + '/[name]-[hash].js';
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
    const to = joinPath(rootDir, config.distDir, DIST_PUBLIC, nonJsAsset);
    await rename(from, to);
  }
  return clientBuildOutput;
};

const pathSpec2pathname = (pathSpec: PathSpec): string => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    throw new Error(
      'Cannot convert pathSpec to pathname: ' + JSON.stringify(pathSpec),
    );
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

// we write a max of 2500 pages at a time to avoid OOM
const PATH_SLICE_SIZE = 2500;

// FIXME this is too hacky
const willEmitPublicIndexHtml = async (
  distEntries: EntriesPrd,
  buildConfig: BuildConfig,
) => {
  const hasConfig = buildConfig.some(({ pathSpec }) => {
    return !!getPathMapping(pathSpec, '/');
  });
  if (!hasConfig) {
    return false;
  }
  const utils = {
    renderRsc: () => {
      throw new Error('Cannot render RSC in HTML build');
    },
    renderHtml: () => {
      const headers = { 'content-type': 'text/html; charset=utf-8' };
      return {
        body: stringToStream('DUMMY'), // HACK this might not work in an edge case
        headers,
      };
    },
  };
  const input = {
    type: 'custom',
    pathname: '/',
    req: {
      body: null,
      url: new URL('http://localhost/'),
      method: 'GET',
      headers: {},
    },
  } as const;
  const res = await distEntries.default.handleRequest(input, utils);
  return !!res;
};

// TODO too long... we need to refactor and organize this function
const emitStaticFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntriesFile: string,
  distEntries: EntriesPrd,
  buildConfig: BuildConfig,
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
  const basePrefix = config.basePath + config.rscBase + '/';
  const publicIndexHtmlFile = joinPath(
    rootDir,
    config.distDir,
    DIST_PUBLIC,
    'index.html',
  );
  const publicIndexHtml = await readFile(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  if (await willEmitPublicIndexHtml(distEntries, buildConfig)) {
    await unlink(publicIndexHtmlFile);
  }
  const publicIndexHtmlHead = publicIndexHtml.replace(
    /.*?<head>(.*?)<\/head>.*/s,
    '$1',
  );
  const dynamicHtmlPathMap = new Map<PathSpec, string>();
  const handlePath = async ({
    pathSpec,
    isStatic,
    entries,
    customCode,
  }: BuildConfig[number]) => {
    const moduleIdsForPrefetch = new Set<string>();
    for (const { rscPath, isStatic } of entries || []) {
      if (!isStatic) {
        continue;
      }
      const destRscFile = joinPath(
        rootDir,
        config.distDir,
        DIST_PUBLIC,
        config.rscBase,
        encodeRscPath(rscPath),
      );
      // Skip if the file already exists.
      if (existsSync(destRscFile)) {
        continue;
      }
      await mkdir(joinPath(destRscFile, '..'), { recursive: true });
      const utils = {
        renderRsc: (elements: Record<string, unknown>) =>
          renderRsc(config, { unstable_modules }, elements, (id) =>
            moduleIdsForPrefetch.add(id),
          ),
        renderHtml: () => {
          throw new Error('Cannot render HTML in RSC build');
        },
      };
      const input = {
        type: 'component',
        rscPath,
        rscParams: undefined,
        req: {
          body: null,
          url: new URL(
            'http://localhost/' + config.rscBase + '/' + encodeRscPath(rscPath),
          ),
          method: 'GET',
          headers: {},
        },
      } as const;
      const res = await distEntries.default.handleRequest(input, utils);
      const rscReadable = res instanceof ReadableStream ? res : res?.body;
      await pipeline(
        Readable.fromWeb(rscReadable as never),
        createWriteStream(destRscFile),
      );
    }
    let htmlStr = publicIndexHtml;
    let htmlHead = publicIndexHtmlHead;
    if (cssAssets.length) {
      const cssStr = cssAssets
        .map(
          (asset) =>
            `<link rel="stylesheet" href="${config.basePath}${asset}">`,
        )
        .join('\n');
      // HACK is this too naive to inject style code?
      htmlStr = htmlStr.replace(/<\/head>/, cssStr);
      htmlHead += cssStr;
    }
    const rscPathsForPrefetch = new Set<string>();
    for (const { rscPath, skipPrefetch } of entries || []) {
      if (!skipPrefetch) {
        rscPathsForPrefetch.add(rscPath);
      }
    }
    const code =
      generatePrefetchCode(
        basePrefix,
        rscPathsForPrefetch,
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
      const lastPathSpecItem = pathSpec.at(-1);
      const ext =
        lastPathSpecItem?.type === 'literal' && extname(lastPathSpecItem.name);
      if (!ext || ext === '.html') {
        // HACK doesn't feel ideal
        dynamicHtmlPathMap.set(pathSpec, htmlHead);
      }
      return;
    }
    const pathname = pathSpec2pathname(pathSpec);
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
    const utils = {
      renderRsc: (elements: Record<string, unknown>) =>
        renderRsc(config, { unstable_modules }, elements),
      renderHtml: (
        elements: Record<string, ReactNode>,
        html: ReactNode,
        rscPath: string,
      ) => {
        const readable = renderHtml(
          config,
          { unstable_modules },
          htmlHead,
          elements,
          html,
          rscPath,
        );
        const headers = { 'content-type': 'text/html; charset=utf-8' };
        return {
          body: readable,
          headers,
        };
      },
    };
    const input = {
      type: 'custom',
      pathname,
      req: {
        body: null,
        url: new URL('http://localhost' + pathname),
        method: 'GET',
        headers: {},
      },
    } as const;
    const res = await distEntries.default.handleRequest(input, utils);
    const readable = res instanceof ReadableStream ? res : res?.body;
    await mkdir(joinPath(destFile, '..'), { recursive: true });
    if (readable) {
      await pipeline(
        Readable.fromWeb(readable as never),
        createWriteStream(destFile),
      );
    } else if (destFile.endsWith('.html')) {
      await writeFile(destFile, htmlStr);
    }
  };

  for (let start = 0; start * PATH_SLICE_SIZE < buildConfig.length; start++) {
    const end = start * PATH_SLICE_SIZE + PATH_SLICE_SIZE;
    await Promise.all(buildConfig.slice(start, end).map(handlePath));
  }

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

  // TODO: Add progress indication for static builds.
  const rsdwServer = await distEntries.loadModule('rsdw-server'); // FIXME hard-coded id
  setAllEnvInternal(env);
  const buildConfig = await distEntries.default.getBuildConfig({
    unstable_collectClientModules: (elements: Record<string, unknown>) =>
      collectClientModules(config, rsdwServer as never, elements),
  });
  const cssAssets = clientBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  await emitStaticFiles(
    rootDir,
    config,
    distEntriesFile,
    distEntries,
    buildConfig,
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
