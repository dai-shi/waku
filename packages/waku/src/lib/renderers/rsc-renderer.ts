import type { ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';

import { unstable_getPlatformObject } from '../../server.js';
import type {
  EntriesDev,
  EntriesPrd,
  setAllEnvInternal as setAllEnvInternalType,
  runWithRenderStoreInternal as runWithRenderStoreInternalType,
} from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { filePathToFileURL } from '../utils/path.js';
import { streamToArrayBuffer } from '../utils/stream.js';
import { decodeFuncId } from '../renderers/utils.js';
import { bufferToString, parseFormData } from '../utils/buffer.js';

export const SERVER_MODULE_MAP = {
  'rsdw-server': 'react-server-dom-webpack/server.edge',
  'waku-server': 'waku/server',
} as const;

const resolveClientEntryForPrd = (id: string, config: { basePath: string }) => {
  return config.basePath + id + '.js';
};

export type RenderRscArgs = {
  env: Record<string, string>;
  config: Omit<ResolvedConfig, 'middleware'>;
  rscPath: string;
  context: Record<string, unknown> | undefined;
  // TODO we hope to get only decoded one
  decodedBody?: unknown;
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
      loadServerModuleRsc: (idOrFileURL: string) => Promise<unknown>;
      resolveClientEntry: (id: string) => string;
    };

export async function renderRsc(
  args: RenderRscArgs,
  opts: RenderRscOpts,
): Promise<ReadableStream> {
  const {
    env,
    config,
    rscPath,
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
    buildData,
  } = entries as
    | (EntriesDev & { loadModule: never; buildData: never })
    | EntriesPrd;

  const loadServerModule = <T>(key: keyof typeof SERVER_MODULE_MAP) =>
    (isDev
      ? opts.loadServerModuleRsc(SERVER_MODULE_MAP[key])
      : loadModule(key)) as Promise<T>;

  const [
    {
      default: { renderToReadableStream, decodeReply },
    },
    { setAllEnvInternal, runWithRenderStoreInternal },
  ] = await Promise.all([
    loadServerModule<{ default: typeof RSDWServerType }>('rsdw-server'),
    loadServerModule<{
      setAllEnvInternal: typeof setAllEnvInternalType;
      runWithRenderStoreInternal: typeof runWithRenderStoreInternalType;
    }>('waku-server'),
  ]);

  setAllEnvInternal(env);
  if (buildData) {
    unstable_getPlatformObject().buildData = buildData;
  }

  const clientBundlerConfig = new Proxy(
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

  const serverBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [fileId, name] = encodedId.split('#') as [string, string];
        const id = isDev ? filePathToFileURL(fileId) : fileId + '.js';
        return { id, chunks: [id], name, async: true };
      },
    },
  );

  const renderWithContext = async (
    context: Record<string, unknown> | undefined,
    rscPath: string,
    rscParams: unknown,
  ) => {
    const renderStore = {
      context: context || {},
      rerender: () => {
        throw new Error('Cannot rerender');
      },
    };
    return runWithRenderStoreInternal(renderStore, async () => {
      const elements = await renderEntries(rscPath, { rscParams });
      if (elements === null) {
        const err = new Error('No function component found');
        (err as any).statusCode = 404; // HACK our convention for NotFound
        throw err;
      }
      if (Object.keys(elements).some((key) => key.startsWith('_'))) {
        throw new Error('"_" prefix is reserved');
      }
      return renderToReadableStream(elements, clientBundlerConfig, {
        onError,
      });
    });
  };

  const renderWithContextWithFunc = async (
    context: Record<string, unknown> | undefined,
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
  ) => {
    let elementsPromise: Promise<Record<string, ReactNode>> = Promise.resolve(
      {},
    );
    let rendered = false;
    const renderStore = {
      context: context || {},
      rerender: async (rscPath: string, rscParams?: unknown) => {
        if (rendered) {
          throw new Error('already rendered');
        }
        elementsPromise = Promise.all([
          elementsPromise,
          renderEntries(rscPath, { rscParams }),
        ]).then(([oldElements, newElements]) => {
          if (newElements === null) {
            console.warn('renderEntries returned null');
          }
          return {
            ...oldElements,
            ...newElements,
          };
        });
      },
    };
    return runWithRenderStoreInternal(renderStore, async () => {
      const value = await fn(...args);
      const elements = await elementsPromise;
      rendered = true;
      if (Object.keys(elements).some((key) => key.startsWith('_'))) {
        throw new Error('"_" prefix is reserved');
      }
      return renderToReadableStream(
        { ...elements, _value: value },
        clientBundlerConfig,
        {
          onError,
        },
      );
    });
  };

  let decodedBody: unknown | undefined = args.decodedBody;
  if (body) {
    const bodyBuf = await streamToArrayBuffer(body);
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // XXX This doesn't support streaming unlike busboy
      const formData = await parseFormData(bodyBuf, contentType);
      decodedBody = await decodeReply(formData, serverBundlerConfig);
    } else if (bodyBuf.byteLength > 0) {
      const bodyStr = bufferToString(bodyBuf);
      decodedBody = await decodeReply(bodyStr, serverBundlerConfig);
    }
  }

  const funcId = decodeFuncId(rscPath);
  if (funcId) {
    const args = Array.isArray(decodedBody)
      ? decodedBody
      : decodedBody instanceof URLSearchParams
        ? [decodedBody]
        : [];
    const [fileId, name] = funcId.split('#') as [string, string];
    let mod: any;
    if (isDev) {
      mod = await opts.loadServerModuleRsc(filePathToFileURL(fileId));
    } else {
      mod = await loadModule(fileId + '.js');
    }
    const fn = mod[name] || mod;
    return renderWithContextWithFunc(context, fn, args);
  }

  return renderWithContext(context, rscPath, decodedBody);
}

type GetBuildConfigArgs = {
  env: Record<string, string>;
  config: Omit<ResolvedConfig, 'middleware'>;
};

type GetBuildConfigOpts = { entries: EntriesPrd };

export async function getBuildConfig(
  args: GetBuildConfigArgs,
  opts: GetBuildConfigOpts,
) {
  const { env, config } = args;
  const { entries } = opts;

  const {
    default: { getBuildConfig },
    loadModule,
  } = entries;
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required.",
    );
    return [];
  }

  const loadServerModule = <T>(key: keyof typeof SERVER_MODULE_MAP) =>
    loadModule(key) as Promise<T>;

  const [{ setAllEnvInternal }] = await Promise.all([
    loadServerModule<{
      setAllEnvInternal: typeof setAllEnvInternalType;
      runWithRenderStoreInternal: typeof runWithRenderStoreInternalType;
    }>('waku-server'),
  ]);

  setAllEnvInternal(env);

  const unstable_collectClientModules = async (
    rscPath: string,
  ): Promise<string[]> => {
    const idSet = new Set<string>();
    const readable = await renderRsc(
      {
        env,
        config,
        rscPath,
        context: undefined,
        moduleIdCallback: (id) => idSet.add(id),
      },
      { isDev: false, entries },
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
  env: Record<string, string>;
  config: Omit<ResolvedConfig, 'middleware'>;
  pathname: string;
  searchParams: URLSearchParams;
};

type GetSsrConfigOpts =
  | { isDev: false; entries: EntriesPrd }
  | {
      isDev: true;
      entries: EntriesDev;
      loadServerModuleRsc: (id: string) => Promise<unknown>;
      resolveClientEntry: (id: string) => string;
    };

export async function getSsrConfig(
  args: GetSsrConfigArgs,
  opts: GetSsrConfigOpts,
) {
  const { env, config, pathname, searchParams } = args;
  const { isDev, entries } = opts;

  const resolveClientEntry = isDev
    ? opts.resolveClientEntry
    : resolveClientEntryForPrd;

  const {
    default: { getSsrConfig },
    loadModule,
    buildData,
  } = entries as
    | (EntriesDev & { loadModule: never; buildData: never })
    | EntriesPrd;

  const loadServerModule = <T>(key: keyof typeof SERVER_MODULE_MAP) =>
    (isDev
      ? opts.loadServerModuleRsc(SERVER_MODULE_MAP[key])
      : loadModule(key)) as Promise<T>;

  const [
    {
      default: { renderToReadableStream },
    },
    { setAllEnvInternal },
  ] = await Promise.all([
    loadServerModule<{ default: typeof RSDWServerType }>('rsdw-server'),
    loadServerModule<{
      setAllEnvInternal: typeof setAllEnvInternalType;
      runWithRenderStoreInternal: typeof runWithRenderStoreInternalType;
    }>('waku-server'),
  ]);

  setAllEnvInternal(env);
  if (buildData) {
    unstable_getPlatformObject().buildData = buildData;
  }

  const ssrConfig = await getSsrConfig?.(pathname, { searchParams });
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
    html: renderToReadableStream(ssrConfig.html, bundlerConfig),
  };
}
