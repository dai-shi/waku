import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as buildVite, resolveConfig as resolveViteConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { RollupLog, LoggingFunction } from 'rollup';

import type { Config } from '../../config.js';
import type { EntriesPrd } from '../../server.js';
import { resolveConfig } from '../config.js';
import type { ResolvedConfig } from '../config.js';
import {
  joinPath,
  extname,
  filePathToFileURL,
  fileURLToFilePath,
  decodeFilePathFromAbsolute,
} from '../utils/path.js';
import type { PathSpec } from '../utils/path.js';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  rename,
  mkdir,
  readFile,
  writeFile,
  appendFile,
  unlink,
} from '../utils/node-fs.js';
import { encodeInput, generatePrefetchCode } from '../renderers/utils.js';
import {
  RSDW_SERVER_MODULE,
  RSDW_SERVER_MODULE_VALUE,
  renderRsc,
  getBuildConfig,
  getSsrConfig,
} from '../renderers/rsc-renderer.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { CLIENT_MODULE_MAP } from '../handlers/handler-dev.js';
import { CLIENT_PREFIX } from '../handlers/handler-prd.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscAnalyzePlugin } from '../plugins/vite-plugin-rsc-analyze.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscServePlugin } from '../plugins/vite-plugin-rsc-serve.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { emitVercelOutput } from './output-vercel.js';
import { emitCloudflareOutput } from './output-cloudflare.js';
import { emitNetlifyOutput } from './output-netlify.js';

// TODO this file and functions in it are too long. will fix.

const WAKU_CLIENT = 'waku-client';

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
  await buildVite({
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
  rootDir: string,
  config: ResolvedConfig,
  entriesFile: string,
  distEntriesFile: string,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverEntryFiles: Record<string, string>,
  ssr: boolean,
  serve: 'vercel' | 'cloudflare' | 'deno' | 'netlify' | false,
) => {
  const serverBuildOutput = await buildVite({
    plugins: [
      nonjsResolvePlugin(),
      rscTransformPlugin({
        isBuild: true,
        assetsDir: config.assetsDir,
        clientEntryFiles: {
          // FIXME this seems very ad-hoc
          [WAKU_CLIENT]: decodeFilePathFromAbsolute(
            joinPath(fileURLToFilePath(import.meta.url), '../../../client.js'),
          ),
          ...clientEntryFiles,
        },
        serverEntryFiles,
      }),
      rscEnvPlugin({ config }),
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
              ssr,
            }),
          ]
        : []),
    ],
    ssr: {
      resolve: {
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
      },
      external:
        (serve === 'cloudflare' && ['hono', 'hono/cloudflare-workers']) || [],
      noExternal: /^(?!node:)/,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    publicDir: false,
    build: {
      ssr: true,
      ssrEmitAssets: true,
      outDir: joinPath(rootDir, config.distDir),
      rollupOptions: {
        onwarn,
        input: {
          entries: entriesFile,
          [RSDW_SERVER_MODULE]: RSDW_SERVER_MODULE_VALUE,
          [WAKU_CLIENT]: CLIENT_MODULE_MAP[WAKU_CLIENT],
          ...commonEntryFiles,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              [WAKU_CLIENT].includes(chunkInfo.name) ||
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
  const psDir = joinPath(config.publicDir, config.assetsDir);
  const code = `
export function loadModule(id) {
  switch (id) {
    case '${RSDW_SERVER_MODULE}':
      return import('./${RSDW_SERVER_MODULE}.js');
${Object.keys(CLIENT_MODULE_MAP)
  .map(
    (key) => `
    case '${CLIENT_PREFIX}${key}':
      return import('./${psDir}/${key}.js');
  `,
  )
  .join('')}
    case '${psDir}/${WAKU_CLIENT}.js':
      return import('./${psDir}/${WAKU_CLIENT}.js');
${Object.entries(serverEntryFiles || {})
  .map(
    ([k]) => `
    case '${config.assetsDir}/${k}.js':
      return import('./${config.assetsDir}/${k}.js');`,
  )
  .join('')}
${Object.entries(clientEntryFiles || {})
  .map(
    ([k]) => `
    case '${psDir}/${k}.js':
      return import('./${psDir}/${k}.js');`,
  )
  .join('')}
    default:
      throw new Error('Cannot find module: ' + id);
  }
}
`;
  await appendFile(distEntriesFile, code);
  return serverBuildOutput;
};

const buildClientBundle = async (
  rootDir: string,
  config: ResolvedConfig,
  commonEntryFiles: Record<string, string>,
  clientEntryFiles: Record<string, string>,
  serverBuildOutput: Awaited<ReturnType<typeof buildServerBundle>>,
  ssr: boolean,
) => {
  const mainJsFile = joinPath(rootDir, config.srcDir, config.mainJs);
  const cssAssets = serverBuildOutput.output.flatMap(({ type, fileName }) =>
    type === 'asset' && fileName.endsWith('.css') ? [fileName] : [],
  );
  const clientBuildOutput = await buildVite({
    base: config.basePath,
    plugins: [
      viteReact(),
      rscIndexPlugin({ ...config, cssAssets }),
      rscEnvPlugin({ config, hydrate: ssr }),
    ],
    build: {
      outDir: joinPath(rootDir, config.distDir, config.publicDir),
      rollupOptions: {
        onwarn,
        input: {
          main: mainJsFile,
          ...CLIENT_MODULE_MAP,
          ...commonEntryFiles,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              CLIENT_MODULE_MAP[
                chunkInfo.name as keyof typeof CLIENT_MODULE_MAP
              ] ||
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
    const from = joinPath(rootDir, config.distDir, cssAsset);
    const to = joinPath(rootDir, config.distDir, config.publicDir, cssAsset);
    await rename(from, to);
  }
  return clientBuildOutput;
};

const emitRscFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntries: EntriesPrd,
  buildConfig: Awaited<ReturnType<typeof getBuildConfig>>,
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
        const readable = await renderRsc({
          input,
          searchParams: new URLSearchParams(),
          method: 'GET',
          config,
          context,
          moduleIdCallback: (id) => addClientModule(input, id),
          isDev: false,
          entries: distEntries,
        });
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
  buildConfig: Awaited<ReturnType<typeof getBuildConfig>>,
  getClientModules: (input: string) => string[],
  ssr: boolean,
) => {
  const basePrefix = config.basePath + config.rscPath + '/';
  const publicIndexHtmlFile = joinPath(
    rootDir,
    config.distDir,
    config.publicDir,
    config.indexHtml,
  );
  const publicIndexHtml = await readFile(publicIndexHtmlFile, {
    encoding: 'utf8',
  });
  if (ssr) {
    await unlink(publicIndexHtmlFile);
  }
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
          extname(pathname) ? pathname : pathname + '/' + config.indexHtml,
        );
        const htmlReadable =
          ssr &&
          (await renderHtml({
            config,
            pathname,
            searchParams: new URLSearchParams(),
            htmlHead,
            renderRscForHtml: (input, searchParams) =>
              renderRsc({
                entries: distEntries,
                config,
                input,
                searchParams,
                method: 'GET',
                context,
                isDev: false,
              }),
            getSsrConfigForHtml: (pathname, searchParams) =>
              getSsrConfig({
                config,
                pathname,
                searchParams,
                isDev: false,
                entries: distEntries,
                isBuild: true,
              }),
            loadClientModule: (key) =>
              distEntries.loadModule(CLIENT_PREFIX + key),
            isDev: false,
            loadModule: distEntries.loadModule,
            isBuild: true,
          }));
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
export const dynamicHtmlPaths= ${JSON.stringify(dynamicHtmlPaths)};
`;
  await appendFile(distEntriesFile, code);
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

export async function build(options: {
  config?: Config;
  ssr?: boolean;
  env?: Record<string, string>;
  deploy?:
    | 'vercel-static'
    | 'vercel-serverless'
    | 'cloudflare'
    | 'deno'
    | 'netlify-static'
    | 'netlify-functions'
    | undefined;
}) {
  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const config = await resolveConfig(options.config || {});
  const rootDir = (
    await resolveViteConfig({}, 'build', 'production', 'production')
  ).root;
  const entriesFile = resolveFileName(
    joinPath(rootDir, config.srcDir, config.entriesJs),
  );
  const distEntriesFile = resolveFileName(
    joinPath(rootDir, config.distDir, config.entriesJs),
  );

  const { commonEntryFiles, clientEntryFiles, serverEntryFiles } =
    await analyzeEntries(entriesFile);
  const serverBuildOutput = await buildServerBundle(
    rootDir,
    config,
    entriesFile,
    distEntriesFile,
    commonEntryFiles,
    clientEntryFiles,
    serverEntryFiles,
    !!options.ssr,
    (options.deploy === 'vercel-serverless' ? 'vercel' : false) ||
      (options.deploy === 'cloudflare' ? 'cloudflare' : false) ||
      (options.deploy === 'deno' ? 'deno' : false) ||
      (options.deploy === 'netlify-functions' ? 'netlify' : false),
  );
  await buildClientBundle(
    rootDir,
    config,
    commonEntryFiles,
    clientEntryFiles,
    serverBuildOutput,
    !!options.ssr,
  );

  const distEntries = await import(filePathToFileURL(distEntriesFile));
  const buildConfig = await getBuildConfig({ config, entries: distEntries });
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
    !!options.ssr,
  );

  if (options.deploy?.startsWith('vercel-')) {
    await emitVercelOutput(
      rootDir,
      config,
      options.deploy.slice('vercel-'.length) as 'static' | 'serverless',
    );
  } else if (options.deploy === 'cloudflare') {
    await emitCloudflareOutput(rootDir, config);
  } else if (options.deploy?.startsWith('netlify-')) {
    await emitNetlifyOutput(
      rootDir,
      config,
      options.deploy.slice('netlify-'.length) as 'static' | 'functions',
    );
  }
}
