import type { ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';
import type { ViteDevServer } from 'vite';

import type {
  EntriesDev,
  EntriesPrd,
  runWithRenderStore as runWithRenderStoreType,
} from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { filePathToFileURL } from '../utils/path.js';
import { parseFormData } from '../utils/form.js';
import { streamToString } from '../utils/stream.js';
import { decodeActionId } from '../renderers/utils.js';

// TEMP HACK: until we eliminate the worker thread
let vitePromiseInWorker: Promise<ViteDevServer> | undefined;
const loadModuleForDev = async (
  id: (typeof SERVER_MODULE_MAP)[keyof typeof SERVER_MODULE_MAP],
) => {
  if (!vitePromiseInWorker) {
    vitePromiseInWorker = Promise.all([
      import('node:fs/promises'),
      import('vite'),
      import('@vitejs/plugin-react'),
      import('../utils/merge-vite-config.js'),
      import('../plugins/vite-plugin-nonjs-resolve.js'),
      import('../plugins/vite-plugin-dev-commonjs.js'),
      import('../plugins/vite-plugin-rsc-transform.js'),
    ]).then(
      async ([
        { readFile },
        { createServer },
        { default: viteReact },
        { mergeUserViteConfig },
        { nonjsResolvePlugin },
        { devCommonJsPlugin },
        { transformServer },
      ]) => {
        return mergeUserViteConfig({
          cacheDir: 'node_modules/.vite/waku-dev-worker',
          plugins: [
            viteReact(),
            nonjsResolvePlugin(),
            devCommonJsPlugin(),
            { name: 'rsc-env-plugin' }, // dummy to match with dev-worker-impl.ts
            { name: 'rsc-private-plugin' }, // dummy to match with dev-worker-impl.ts
            { name: 'rsc-managed-plugin' }, // dummy to match with dev-worker-impl.ts
            { name: 'rsc-transform-plugin' }, // dummy to match with dev-worker-impl.ts
            { name: 'rsc-delegate-plugin' }, // dummy to match with dev-worker-impl.ts
          ],
          optimizeDeps: {
            include: ['react-server-dom-webpack/client', 'react-dom'],
            exclude: ['waku'],
          },
          ssr: {
            resolve: {
              conditions: ['react-server', 'workerd'],
              externalConditions: ['react-server', 'workerd'],
            },
            noExternal: /^(?!node:)/,
            optimizeDeps: {
              include: [
                'react-server-dom-webpack/server',
                'react',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
              ],
              esbuildOptions: {
                plugins: [
                  {
                    name: 'transform-rsc',
                    setup(build) {
                      build.onLoad({ filter: /.*/ }, async (args) => {
                        const text = await readFile(args.path, 'utf8');
                        const code = transformServer(
                          text,
                          args.path,
                          (id) => id,
                          (id) => id,
                        );
                        if (code) {
                          return { contents: code };
                        }
                      });
                    },
                  },
                ],
              },
            },
          },
        }).then((mergedViteConfig) => createServer(mergedViteConfig));
      },
    );
  }
  const vite = await vitePromiseInWorker;
  const mod = await vite.ssrLoadModule(id);
  console.log('loaded', id, mod);
  return mod;
};

export const SERVER_MODULE_MAP = {
  'rsdw-server': 'react-server-dom-webpack/server.edge',
  'waku-server': 'waku/server',
} as const;

const resolveClientEntryForPrd = (id: string, config: { basePath: string }) => {
  if (!id.startsWith('@id/')) {
    throw new Error('Unexpected client entry in PRD');
  }
  return config.basePath + id.slice('@id/'.length);
};

export type RenderRscArgs = {
  config: Omit<ResolvedConfig, 'middleware'>;
  input: string;
  searchParams: URLSearchParams;
  method: 'GET' | 'POST';
  context: Record<string, unknown> | undefined;
  body?: ReadableStream | undefined;
  contentType?: string | undefined;
  moduleIdCallback?: ((id: string) => void) | undefined;
  onError?: (err: unknown) => void;
};

type RenderRscOpts =
  | { isDev: false; entries: EntriesPrd }
  | {
      isDev: true;
      entries: EntriesDev;
      loadServerFile: (fileURL: string) => Promise<unknown>;
      resolveClientEntry: (id: string) => string;
    };

export async function renderRsc(
  args: RenderRscArgs,
  opts: RenderRscOpts,
): Promise<ReadableStream> {
  const {
    config,
    input,
    searchParams,
    method,
    contentType,
    context,
    body,
    moduleIdCallback,
    onError,
  } = args;
  const { isDev, entries } = opts;

  const resolveClientEntry = isDev
    ? opts.resolveClientEntry
    : resolveClientEntryForPrd;

  const {
    default: { renderEntries },
    loadModule,
    buildConfig,
  } = entries as
    | (EntriesDev & { loadModule: never; buildConfig: never })
    | EntriesPrd;

  const loadServerModule = <T>(key: keyof typeof SERVER_MODULE_MAP) =>
    (isDev
      ? loadModuleForDev(SERVER_MODULE_MAP[key])
      : loadModule(key)) as Promise<T>;

  const [
    {
      default: { renderToReadableStream, decodeReply },
    },
    { runWithRenderStore },
  ] = await Promise.all([
    loadServerModule<{ default: typeof RSDWServerType }>('rsdw-server'),
    loadServerModule<{ runWithRenderStore: typeof runWithRenderStoreType }>(
      'waku-server',
    ),
  ]);

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(file, config);
        moduleIdCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );

  const renderWithContext = async (
    context: Record<string, unknown> | undefined,
    input: string,
    searchParams: URLSearchParams,
  ) => {
    const renderStore = {
      context: context || {},
      rerender: () => {
        throw new Error('Cannot rerender');
      },
    };
    return runWithRenderStore(renderStore, async () => {
      const elements = await renderEntries(input, {
        searchParams,
        buildConfig,
      });
      if (elements === null) {
        const err = new Error('No function component found');
        (err as any).statusCode = 404; // HACK our convention for NotFound
        throw err;
      }
      if (Object.keys(elements).some((key) => key.startsWith('_'))) {
        throw new Error('"_" prefix is reserved');
      }
      return renderToReadableStream(elements, bundlerConfig, {
        onError,
      });
    });
  };

  const renderWithContextWithAction = async (
    context: Record<string, unknown> | undefined,
    actionFn: (...args: unknown[]) => unknown,
    actionArgs: unknown[],
  ) => {
    let elementsPromise: Promise<Record<string, ReactNode>> = Promise.resolve(
      {},
    );
    let rendered = false;
    const renderStore = {
      context: context || {},
      rerender: async (input: string, searchParams = new URLSearchParams()) => {
        if (rendered) {
          throw new Error('already rendered');
        }
        elementsPromise = Promise.all([
          elementsPromise,
          renderEntries(input, { searchParams, buildConfig }),
        ]).then(([oldElements, newElements]) => ({
          ...oldElements,
          // FIXME we should actually check if newElements is null and send an error
          ...newElements,
        }));
      },
    };
    return runWithRenderStore(renderStore, async () => {
      const actionValue = await actionFn(...actionArgs);
      const elements = await elementsPromise;
      rendered = true;
      if (Object.keys(elements).some((key) => key.startsWith('_'))) {
        throw new Error('"_" prefix is reserved');
      }
      return renderToReadableStream(
        { ...elements, _value: actionValue },
        bundlerConfig,
        {
          onError,
        },
      );
    });
  };

  if (method === 'POST') {
    const rsfId = decodeActionId(input);
    let args: unknown[] = [];
    let bodyStr = '';
    if (body) {
      bodyStr = await streamToString(body);
    }
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // XXX This doesn't support streaming unlike busboy
      const formData = parseFormData(bodyStr, contentType);
      args = await decodeReply(formData);
    } else if (bodyStr) {
      args = await decodeReply(bodyStr);
    }
    const [fileId, name] = rsfId.split('#') as [string, string];
    let mod: any;
    if (isDev) {
      mod = await opts.loadServerFile(filePathToFileURL(fileId));
    } else {
      if (!fileId.startsWith('@id/')) {
        throw new Error('Unexpected server entry in PRD');
      }
      mod = await loadModule(fileId.slice('@id/'.length));
    }
    const fn = mod.__waku_serverActions?.get(name) || mod[name] || mod;
    return renderWithContextWithAction(context, fn, args);
  }

  // method === 'GET'
  return renderWithContext(context, input, searchParams);
}

export async function getBuildConfig(opts: {
  config: ResolvedConfig;
  entries: EntriesPrd;
}) {
  const { config, entries } = opts;

  const {
    default: { getBuildConfig },
  } = entries;
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required.",
    );
    return [];
  }

  const unstable_collectClientModules = async (
    input: string,
  ): Promise<string[]> => {
    const idSet = new Set<string>();
    const readable = await renderRsc(
      {
        config,
        input,
        searchParams: new URLSearchParams(),
        method: 'GET',
        context: undefined,
        moduleIdCallback: (id) => idSet.add(id),
      },
      {
        isDev: false,
        entries,
      },
    );
    await new Promise<void>((resolve, reject) => {
      const writable = new WritableStream({
        close() {
          resolve();
        },
        abort(reason) {
          reject(reason);
        },
      });
      readable.pipeTo(writable).catch(reject);
    });
    return Array.from(idSet);
  };

  const output = await getBuildConfig(unstable_collectClientModules);
  return output;
}

export type GetSsrConfigArgs = {
  config: Omit<ResolvedConfig, 'middleware'>;
  pathname: string;
  searchParams: URLSearchParams;
};

type GetSsrConfigOpts =
  | { isDev: false; entries: EntriesPrd }
  | {
      isDev: true;
      entries: EntriesDev;
      resolveClientEntry: (id: string) => string;
    };

export async function getSsrConfig(
  args: GetSsrConfigArgs,
  opts: GetSsrConfigOpts,
) {
  const { config, pathname, searchParams } = args;
  const { isDev, entries } = opts;

  const resolveClientEntry = isDev
    ? opts.resolveClientEntry
    : resolveClientEntryForPrd;

  const {
    default: { getSsrConfig },
    loadModule,
    buildConfig,
  } = entries as
    | (EntriesDev & { loadModule: never; buildConfig: never })
    | EntriesPrd;
  const { renderToReadableStream } = await (isDev
    ? loadModuleForDev(SERVER_MODULE_MAP['rsdw-server']).then((m) => m.default)
    : loadModule('rsdw-server').then((m: any) => m.default));

  const ssrConfig = await getSsrConfig?.(pathname, {
    searchParams,
    buildConfig,
  });
  if (!ssrConfig) {
    return null;
  }
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(file, config);
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  return {
    ...ssrConfig,
    body: renderToReadableStream(ssrConfig.body, bundlerConfig),
  };
}
