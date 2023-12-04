import path from 'node:path'; // TODO no node dependency
import url from 'node:url'; // TODO no node dependency
import type { ReactNode } from 'react';

import { defineEntries } from '../../server.js';
import type { RenderContext } from '../../server.js';
import type { ResolvedConfig } from '../../config.js';
import { normalizePath } from '../utils/path.js';
import { parseFormData } from '../utils/form.js';

const loadRSDWServer = async (
  config: Omit<ResolvedConfig, 'ssr'>,
  isDev: boolean,
) => {
  if (!isDev) {
    return (
      await import(
        url
          .pathToFileURL(
            path.join(config.rootDir, config.distDir, 'rsdw-server.js'),
          )
          .toString()
      )
    ).default;
  }
  return import('react-server-dom-webpack/server.edge');
};

type Entries = {
  default: ReturnType<typeof defineEntries>;
};

const getEntriesFile = (
  config: Omit<ResolvedConfig, 'ssr'>,
  isDev: boolean,
) => {
  const filePath = path.join(
    config.rootDir,
    isDev ? config.srcDir : config.distDir,
    config.entriesJs,
  );
  return normalizePath(
    isDev ? filePath : url.pathToFileURL(filePath).toString(),
  );
};

const resolveClientEntry = (
  filePath: string,
  config: Omit<ResolvedConfig, 'ssr'>,
  isDev: boolean,
) => {
  filePath = filePath.startsWith('file:///')
    ? url.fileURLToPath(filePath)
    : filePath;
  const root = path.join(
    config.rootDir,
    isDev ? config.srcDir : config.distDir,
  );
  if (!filePath.startsWith(root)) {
    if (isDev) {
      // HACK this relies on Vite's internal implementation detail.
      return normalizePath(
        config.basePath + '@fs/' + filePath.replace(/^\//, ''),
      );
    } else {
      throw new Error(
        'Resolving client module outside root is unsupported for now',
      );
    }
  }
  return normalizePath(config.basePath + path.relative(root, filePath));
};

// HACK Patching stream is very fragile.
const transformRsfId = (prefixToRemove: string) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let data = '';
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      data += decoder.decode(chunk);
      if (!data.endsWith('\n')) {
        return;
      }
      const lines = data.split('\n');
      data = '';
      for (let i = 0; i < lines.length; ++i) {
        const match = lines[i]!.match(
          new RegExp(
            `^([0-9]+):{"id":"(?:file:///?)?${prefixToRemove}(.*?)"(.*)$`,
          ),
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${match[2]}"${match[3]}`;
        }
      }
      controller.enqueue(encoder.encode(lines.join('\n')));
    },
  });
};

export async function renderRSC(
  opts: {
    config: Omit<ResolvedConfig, 'ssr'>;
    input: string;
    method: 'GET' | 'POST';
    context: unknown;
    body?: ReadableStream;
    contentType?: string | undefined;
    moduleIdCallback?: (id: string) => void;
  } & (
    | { isDev: false }
    | { isDev: true; customImport: (id: string) => Promise<unknown> }
  ),
): Promise<ReadableStream> {
  const {
    config,
    input,
    method,
    contentType,
    context,
    body,
    moduleIdCallback,
    isDev,
  } = opts;
  const customImport = isDev ? opts.customImport : (id: string) => import(id);

  const { renderToReadableStream, decodeReply } = await loadRSDWServer(
    config,
    isDev,
  );

  const entriesFile = getEntriesFile(config, isDev);
  const {
    default: { renderEntries },
  } = await (customImport(entriesFile) as Promise<Entries>);

  const rsfPrefix =
    path.posix.join(config.rootDir, isDev ? config.srcDir : config.distDir) +
    '/';

  const render = async (renderContext: RenderContext, input: string) => {
    const elements = await renderEntries.call(renderContext, input);
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
        const [filePath, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(filePath, config, isDev);
        moduleIdCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );

  if (method === 'POST') {
    const rsfId = decodeURIComponent(input);
    let args: unknown[] = [];
    let bodyStr = '';
    if (body) {
      const decoder = new TextDecoder();
      const reader = body.getReader();
      let result: ReadableStreamReadResult<unknown>;
      do {
        result = await reader.read();
        if (result.value) {
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('Unexepected buffer type');
          }
          bodyStr += decoder.decode(result.value);
        }
      } while (!result.done);
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
    const filePath = fileId.startsWith('/') ? fileId : rsfPrefix + fileId;
    const fname = isDev ? filePath : url.pathToFileURL(filePath).toString();
    const mod = await customImport(fname);
    const fn = mod[name] || mod;
    let elements: Promise<Record<string, ReactNode>> = Promise.resolve({});
    let rendered = false;
    const rerender = (input: string) => {
      if (rendered) {
        throw new Error('already rendered');
      }
      const renderContext: RenderContext = { rerender, context };
      elements = Promise.all([elements, render(renderContext, input)]).then(
        ([oldElements, newElements]) => ({ ...oldElements, ...newElements }),
      );
    };
    const renderContext: RenderContext = { rerender, context };
    const data = await fn.apply(renderContext, args);
    const resolvedElements = await elements;
    rendered = true;
    return renderToReadableStream(
      { ...resolvedElements, _value: data },
      bundlerConfig,
    ).pipeThrough(transformRsfId(rsfPrefix));
  }

  // rr.method === 'GET'
  const renderContext: RenderContext = {
    rerender: () => {
      throw new Error('Cannot rerender');
    },
    context,
  };
  const elements = await render(renderContext, input);
  return renderToReadableStream(elements, bundlerConfig).pipeThrough(
    transformRsfId(rsfPrefix),
  );
}

export async function getBuildConfigRSC(opts: {
  config: Omit<ResolvedConfig, 'ssr'>;
}) {
  const { config } = opts;

  const entriesFile = getEntriesFile(config, false);
  const {
    default: { getBuildConfig },
  } = await (import(entriesFile) as Promise<Entries>);
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required.",
    );
    return {};
  }

  const unstable_collectClientModules = async (
    input: string,
  ): Promise<string[]> => {
    const idSet = new Set<string>();
    const readable = await renderRSC({
      input,
      method: 'GET',
      config,
      context: null,
      moduleIdCallback: (id) => idSet.add(id),
      isDev: false,
    });
    await new Promise<void>((resolve, reject) => {
      const writable = new WritableStream({
        close() {
          resolve();
        },
        abort(reason) {
          reject(reason);
        },
      });
      readable.pipeTo(writable);
    });
    return Array.from(idSet);
  };

  const output = await getBuildConfig(unstable_collectClientModules);
  return output;
}
