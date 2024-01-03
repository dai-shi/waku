import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { build as buildVite, resolveConfig as resolveViteConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import type { RollupLog, LoggingFunction } from 'rollup';

import { resolveConfig } from '../config.js';
import type { Config, ResolvedConfig } from '../config.js';
import {
  joinPath,
  extname,
  filePathToFileURL,
  fileURLToFilePath,
  decodeFilePathFromAbsolute,
} from '../utils/path.js';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  rename,
  mkdir,
  readFile,
  writeFile,
  appendFile,
} from '../utils/node-fs.js';
import { encodeInput, generatePrefetchCode } from '../renderers/utils.js';
import {
  RSDW_SERVER_MODULE,
  RSDW_SERVER_MODULE_VALUE,
  renderRsc,
  getBuildConfig,
  getSsrConfig,
} from '../renderers/rsc-renderer.js';
import {
  REACT_MODULE,
  REACT_MODULE_VALUE,
  RD_SERVER_MODULE,
  RD_SERVER_MODULE_VALUE,
  RSDW_CLIENT_MODULE,
  RSDW_CLIENT_MODULE_VALUE,
  WAKU_CLIENT_MODULE,
  WAKU_CLIENT_MODULE_VALUE,
  renderHtml,
} from '../renderers/html-renderer.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscAnalyzePlugin } from '../plugins/vite-plugin-rsc-analyze.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { emitVercelOutput } from './output-vercel.js';
import { emitCloudflareOutput } from './output-cloudflare.js';
import { emitDenoOutput } from './output-deno.js';

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
) => {
  const serverBuildOutput = await buildVite({
    plugins: [
      nonjsResolvePlugin(),
      rscTransformPlugin({
        isBuild: true,
        assetsDir: config.assetsDir,
        clientEntryFiles: {
          // FIXME this seems very ad-hoc
          [WAKU_CLIENT_MODULE]: decodeFilePathFromAbsolute(
            joinPath(fileURLToFilePath(import.meta.url), '../../../client.js'),
          ),
          ...clientEntryFiles,
        },
        serverEntryFiles,
      }),
      rscEnvPlugin({ config }),
    ],
    ssr: {
      resolve: {
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
      },
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
          [WAKU_CLIENT_MODULE]: WAKU_CLIENT_MODULE_VALUE,
          ...commonEntryFiles,
          ...clientEntryFiles,
          ...serverEntryFiles,
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              [WAKU_CLIENT_MODULE].includes(chunkInfo.name) ||
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
    case 'public/${REACT_MODULE}':
      return import('./${psDir}/${REACT_MODULE}.js');
    case 'public/${RD_SERVER_MODULE}':
      return import('./${psDir}/${RD_SERVER_MODULE}.js');
    case 'public/${RSDW_CLIENT_MODULE}':
      return import('./${psDir}/${RSDW_CLIENT_MODULE}.js');
    case 'public/${WAKU_CLIENT_MODULE}':
      return import('./${psDir}/${WAKU_CLIENT_MODULE}.js');
    case '${psDir}/${WAKU_CLIENT_MODULE}.js':
      return import('./${psDir}/${WAKU_CLIENT_MODULE}.js');
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
    case 'public/${config.assetsDir}/${k}.js':
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
      patchReactRefresh(viteReact()),
      rscIndexPlugin({ ...config, cssAssets }),
      rscEnvPlugin({ config, hydrate: ssr }),
    ],
    build: {
      outDir: joinPath(rootDir, config.distDir, config.publicDir),
      rollupOptions: {
        onwarn,
        input: {
          main: mainJsFile,
          [REACT_MODULE]: REACT_MODULE_VALUE,
          [RD_SERVER_MODULE]: RD_SERVER_MODULE_VALUE,
          [RSDW_CLIENT_MODULE]: RSDW_CLIENT_MODULE_VALUE,
          [WAKU_CLIENT_MODULE]: WAKU_CLIENT_MODULE_VALUE,
          ...commonEntryFiles,
          ...clientEntryFiles,
        },
        preserveEntrySignatures: 'exports-only',
        output: {
          entryFileNames: (chunkInfo) => {
            if (
              [
                REACT_MODULE,
                RD_SERVER_MODULE,
                RSDW_CLIENT_MODULE,
                WAKU_CLIENT_MODULE,
              ].includes(chunkInfo.name) ||
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
  distEntriesFile: string,
) => {
  const distEntries = await import(filePathToFileURL(distEntriesFile));
  const buildConfig = await getBuildConfig({ config, entries: distEntries });
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
  const staticInputSet = new Set<string>();
  await Promise.all(
    Array.from(buildConfig).map(async ({ entries, context }) => {
      for (const { input, isStatic } of entries || []) {
        if (isStatic) {
          staticInputSet.add(input);
        }
        const destRscFile = joinPath(
          rootDir,
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
      }
    }),
  );
  const skipRenderRscCode = `
const staticInputSet = new Set(${JSON.stringify(Array.from(staticInputSet))});
export function skipRenderRsc(input) {
  return staticInputSet.has(input);
}
`;
  await appendFile(distEntriesFile, skipRenderRscCode);
  return { buildConfig, getClientModules, rscFiles: Array.from(rscFileSet) };
};

const emitHtmlFiles = async (
  rootDir: string,
  config: ResolvedConfig,
  distEntriesFile: string,
  buildConfig: Awaited<ReturnType<typeof getBuildConfig>>,
  getClientModules: (input: string) => string[],
  ssr: boolean,
) => {
  const distEntries = await import(filePathToFileURL(distEntriesFile));
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
  const publicIndexHtmlHead = publicIndexHtml.replace(
    /.*?<head>(.*?)<\/head>.*/s,
    '$1',
  );
  const htmlHeadMap: Record<string, string> = {};
  // TODO check duplicated files like rscFileSet
  const htmlFiles = await Promise.all(
    Array.from(buildConfig).map(
      async ({ pathname, entries, customCode, context }) => {
        let htmlStr = publicIndexHtml;
        let htmlHead = publicIndexHtmlHead;
        const destHtmlFile = joinPath(
          rootDir,
          config.distDir,
          config.publicDir,
          extname(pathname) ? pathname : pathname + '/' + config.indexHtml,
        );
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
        htmlHeadMap[pathname] = htmlHead;
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
        return destHtmlFile;
      },
    ),
  );
  const loadHtmlHeadCode = `
export function loadHtmlHead(pathname) {
  return ${JSON.stringify(htmlHeadMap)}[pathname] || ${JSON.stringify(
    publicIndexHtmlHead,
  )};
}
`;
  await appendFile(distEntriesFile, loadHtmlHeadCode);
  return { htmlFiles };
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
  vercel?: { type: 'static' | 'serverless' } | undefined;
  cloudflare?: boolean;
  deno?: boolean;
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
  );
  await buildClientBundle(
    rootDir,
    config,
    commonEntryFiles,
    clientEntryFiles,
    serverBuildOutput,
    !!options.ssr,
  );

  const { buildConfig, getClientModules, rscFiles } = await emitRscFiles(
    rootDir,
    config,
    distEntriesFile,
  );
  const { htmlFiles } = await emitHtmlFiles(
    rootDir,
    config,
    distEntriesFile,
    buildConfig,
    getClientModules,
    !!options.ssr,
  );

  if (options.vercel) {
    await emitVercelOutput(
      rootDir,
      config,
      rscFiles,
      htmlFiles,
      !!options.ssr,
      options.vercel.type,
    );
  }

  if (options.cloudflare) {
    await emitCloudflareOutput(rootDir, config, !!options.ssr);
  }

  if (options.deno) {
    await emitDenoOutput(rootDir, config, !!options.ssr);
  }
}
