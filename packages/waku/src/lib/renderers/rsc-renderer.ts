import type { ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';

import type { RenderContext, EntriesDev, EntriesPrd } from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { filePathToFileURL } from '../utils/path.js';
import { parseFormData } from '../utils/form.js';
import { streamToString } from '../utils/stream.js';
import { decodeActionId } from '../renderers/utils.js';

export const RSDW_SERVER_MODULE = 'rsdw-server';
export const RSDW_SERVER_MODULE_VALUE = 'react-server-dom-webpack/server.edge';

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
      customImport: (fileURL: string) => Promise<unknown>;
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
  const {
    default: { renderToReadableStream, decodeReply },
  } = await ((
    isDev ? import(RSDW_SERVER_MODULE_VALUE) : loadModule!(RSDW_SERVER_MODULE)
  ) as Promise<{
    default: typeof RSDWServerType;
  }>);

  const render = async (
    renderContext: RenderContext,
    input: string,
    searchParams: URLSearchParams,
  ) => {
    const elements = await renderEntries.call(
      renderContext,
      input,
      searchParams,
    );
    if (elements === null) {
      const err = new Error('No function component found');
      (err as any).statusCode = 404; // HACK our convention for NotFound
      throw err;
    }
    if (Object.keys(elements).some((key) => key.startsWith('_'))) {
      throw new Error('"_" prefix is reserved');
    }
    return elements;
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
      mod = await opts.customImport(filePathToFileURL(fileId));
    } else {
      if (!fileId.startsWith('@id/')) {
        throw new Error('Unexpected server entry in PRD');
      }
      mod = await loadModule!(fileId.slice('@id/'.length));
    }
    const fn = mod[name] || mod;
    let elements: Promise<Record<string, ReactNode>> = Promise.resolve({});
    let rendered = false;
    const rerender = (input: string, searchParams = new URLSearchParams()) => {
      if (rendered) {
        throw new Error('already rendered');
      }
      const renderContext: RenderContext = { rerender, context: context || {} };
      elements = Promise.all([
        elements,
        render(renderContext, input, searchParams),
      ]).then(([oldElements, newElements]) => ({
        ...oldElements,
        ...newElements,
      }));
    };
    const renderContext: RenderContext = { rerender, context: context || {} };
    const data = await fn.apply(renderContext, args);
    const resolvedElements = await elements;
    rendered = true;
    return renderToReadableStream(
      { ...resolvedElements, _value: data },
      bundlerConfig,
    );
  }

  // method === 'GET'
  const renderContext: RenderContext = {
    rerender: () => {
      throw new Error('Cannot rerender');
    },
    context: context || {},
  };
  const elements = await render(renderContext, input, searchParams);
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
    ? import(RSDW_SERVER_MODULE_VALUE)
    : loadModule!(RSDW_SERVER_MODULE).then((m: any) => m.default));

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
