import type { default as ReactType, ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';
import type { default as RSDWClientType } from 'react-server-dom-webpack/client.edge';

import type {
  EntriesDev,
  EntriesPrd,
  setRenderContext as setRenderContextType,
} from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { filePathToFileURL } from '../utils/path.js';
import { parseFormData } from '../utils/form.js';
import { streamToString } from '../utils/stream.js';
import { decodeActionId } from '../renderers/utils.js';

export const SERVER_MODULE_MAP = {
  react: 'react',
  'rsdw-server': 'react-server-dom-webpack/server.edge',
  'rsdw-client': 'react-server-dom-webpack/client.edge',
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
};

type RenderRscOpts =
  | { isDev: false; entries: EntriesPrd }
  | {
      isDev: true;
      entries: EntriesDev;
      loadServerFile: (fileURL: string) => Promise<unknown>;
      loadServerModule: (id: string) => Promise<unknown>;
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
  } = args;
  const { isDev, entries } = opts;

  const resolveClientEntry = isDev
    ? opts.resolveClientEntry
    : resolveClientEntryForPrd;

  const {
    default: { renderEntries },
    loadModule,
  } = entries as (EntriesDev & { loadModule: undefined }) | EntriesPrd;

  const loadServerModule = <T>(key: keyof typeof SERVER_MODULE_MAP) =>
    (isDev
      ? import(/* @vite-ignore */ SERVER_MODULE_MAP[key])
      : loadModule!(key)) as Promise<T>;

  const [
    {
      default: { createElement },
    },
    {
      default: { renderToReadableStream, decodeReply },
    },
    {
      default: { createFromReadableStream },
    },
    { setRenderContext },
  ] = await Promise.all([
    loadServerModule<{ default: typeof ReactType }>('react'),
    loadServerModule<{ default: typeof RSDWServerType }>('rsdw-server'),
    loadServerModule<{ default: typeof RSDWClientType }>('rsdw-client'),
    (isDev
      ? opts.loadServerModule(SERVER_MODULE_MAP['waku-server'])
      : loadModule!('waku-server')) as Promise<{
      setRenderContext: typeof setRenderContextType;
    }>,
  ]);

  const runWithRenderContext = async <T>(
    renderContext: Parameters<typeof setRenderContext>[0],
    fn: () => T,
  ): Promise<Awaited<T>> =>
    new Promise<Awaited<T>>((resolve, reject) => {
      createFromReadableStream(
        renderToReadableStream(
          createElement((async () => {
            setRenderContext(renderContext);
            resolve(await fn());
          }) as any),
          {},
        ),
        {
          ssrManifest: { moduleMap: null, moduleLoading: null },
        },
      ).catch(reject);
    });

  const wrapWithContext = (
    context: Record<string, unknown> | undefined,
    elements: Record<string, ReactNode>,
    value?: unknown,
  ) => {
    const renderContext = {
      context: context || {},
      rerender: () => {
        throw new Error('Cannot rerender');
      },
    };
    const elementEntries: [string, unknown][] = Object.entries(elements).map(
      ([k, v]) => [
        k,
        createElement(() => {
          setRenderContext(renderContext);
          return v as ReactNode; // XXX lie the type
        }),
      ],
    );
    if (value !== undefined) {
      elementEntries.push(['_value', value]);
    }
    return Object.fromEntries(elementEntries);
  };

  const renderWithContext = async (
    context: Record<string, unknown> | undefined,
    input: string,
    searchParams: URLSearchParams,
  ) => {
    const renderContext = {
      context: context || {},
      rerender: () => {
        throw new Error('Cannot rerender');
      },
    };
    const elements = await runWithRenderContext(renderContext, () =>
      renderEntries(input, searchParams),
    );
    if (elements === null) {
      const err = new Error('No function component found');
      (err as any).statusCode = 404; // HACK our convention for NotFound
      throw err;
    }
    if (Object.keys(elements).some((key) => key.startsWith('_'))) {
      throw new Error('"_" prefix is reserved');
    }
    return wrapWithContext(context, elements);
  };

  const renderWithContextWithAction = async (
    context: Record<string, unknown> | undefined,
    actionFn: () => unknown,
  ) => {
    let elementsPromise: Promise<Record<string, ReactNode>> = Promise.resolve(
      {},
    );
    let rendered = false;
    const renderContext = {
      context: context || {},
      rerender: async (input: string, searchParams = new URLSearchParams()) => {
        if (rendered) {
          throw new Error('already rendered');
        }
        elementsPromise = Promise.all([
          elementsPromise,
          renderEntries(input, searchParams),
        ]).then(([oldElements, newElements]) => ({
          ...oldElements,
          // FIXME we should actually check if newElements is null and send an error
          ...newElements,
        }));
      },
    };
    const actionValue = await runWithRenderContext(renderContext, actionFn);
    const elements = await elementsPromise;
    rendered = true;
    if (Object.keys(elements).some((key) => key.startsWith('_'))) {
      throw new Error('"_" prefix is reserved');
    }
    return wrapWithContext(context, elements, actionValue);
  };

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
      mod = await loadModule!(fileId.slice('@id/'.length));
    }
    const fn = mod[name] || mod;
    const elements = await renderWithContextWithAction(context, () =>
      fn(...args),
    );
    return renderToReadableStream(elements, bundlerConfig);
  }

  // method === 'GET'
  const elements = await renderWithContext(context, input, searchParams);
  return renderToReadableStream(elements, bundlerConfig);
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
  } = entries as (EntriesDev & { loadModule: undefined }) | EntriesPrd;
  const { renderToReadableStream } = await (isDev
    ? import(/* @vite-ignore */ SERVER_MODULE_MAP['rsdw-server'])
    : loadModule!('rsdw-server').then((m: any) => m.default));

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
    body: renderToReadableStream(ssrConfig.body, bundlerConfig),
  };
}
