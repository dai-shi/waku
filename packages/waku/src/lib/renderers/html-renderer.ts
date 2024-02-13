import type {
  default as ReactType,
  createElement as createElementType,
  ReactNode,
  FunctionComponent,
  ComponentProps,
} from 'react';
import type * as RDServerType from 'react-dom/server.edge';
import type { default as RSDWClientType } from 'react-server-dom-webpack/client.edge';

import type * as WakuClientType from '../../client.js';
import type { EntriesPrd } from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import type { CLIENT_MODULE_KEY } from '../handlers/handler-dev.js';
import { concatUint8Arrays } from '../utils/stream.js';
import {
  joinPath,
  filePathToFileURL,
  fileURLToFilePath,
} from '../utils/path.js';
import { encodeInput, hasStatusCode } from './utils.js';

// HACK for react-server-dom-webpack without webpack
(globalThis as any).__webpack_module_loading__ ||= new Map();
(globalThis as any).__webpack_module_cache__ ||= new Map();
(globalThis as any).__webpack_chunk_load__ ||= async (id: string) =>
  (globalThis as any).__webpack_module_loading__.get(id);
(globalThis as any).__webpack_require__ ||= (id: string) =>
  (globalThis as any).__webpack_module_cache__.get(id);
const moduleLoading = (globalThis as any).__webpack_module_loading__;
const moduleCache = (globalThis as any).__webpack_module_cache__;

const fakeFetchCode = `
Promise.resolve(new Response(new ReadableStream({
  start(c) {
    const f = (s) => new TextEncoder().encode(decodeURI(s));
    globalThis.__WAKU_PUSH__ = (s) => s ? c.enqueue(f(s)) : c.close();
  }
})))
`
  .split('\n')
  .map((line) => line.trim())
  .join('');

const injectRscPayload = (
  readable: ReadableStream,
  urlForFakeFetch: string,
) => {
  const chunks: Uint8Array[] = [];
  const copied = readable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        chunks.push(chunk);
        controller.enqueue(chunk);
      },
    }),
  );
  const modifyHead = (data: string) => {
    const matchPrefetched = data.match(
      // HACK This is very brittle
      /(.*<script[^>]*>\nglobalThis\.__WAKU_PREFETCHED__ = {\n)(.*?)(\n};.*)/s,
    );
    if (matchPrefetched) {
      data =
        matchPrefetched[1] +
        `  '${urlForFakeFetch}': ${fakeFetchCode},` +
        matchPrefetched[3];
    }
    const closingHeadIndex = data.indexOf('</head>');
    if (closingHeadIndex === -1) {
      throw new Error('closing head not found');
    }
    let code = '';
    if (!matchPrefetched) {
      code += `
globalThis.__WAKU_PREFETCHED__ = {
  '${urlForFakeFetch}': ${fakeFetchCode},
};
`;
    }
    if (code) {
      data =
        data.slice(0, closingHeadIndex) +
        `<script type="module" async>${code}</script>` +
        data.slice(closingHeadIndex);
    }
    return data;
  };
  const interleave = () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let headSent = false;
    let data = '';
    let scriptsClosed = false;
    const sendScripts = (
      controller: TransformStreamDefaultController,
      close?: boolean,
    ) => {
      if (scriptsClosed) {
        return;
      }
      const scripts = chunks.splice(0).map(
        (chunk) =>
          `
<script type="module" async>globalThis.__WAKU_PUSH__("${encodeURI(
            decoder.decode(chunk),
          )}")</script>`,
      );
      if (close) {
        scriptsClosed = true;
        scripts.push(
          `
<script type="module" async>globalThis.__WAKU_PUSH__()</script>`,
        );
      }
      if (scripts.length) {
        controller.enqueue(encoder.encode(scripts.join('')));
      }
    };
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        data += decoder.decode(chunk);
        if (!headSent) {
          if (!data.includes('</head>')) {
            return;
          }
          headSent = true;
          data = modifyHead(data);
        }
        const closingBodyIndex = data.lastIndexOf('</body>');
        if (closingBodyIndex === -1) {
          controller.enqueue(encoder.encode(data));
          data = '';
          sendScripts(controller);
        } else {
          controller.enqueue(encoder.encode(data.slice(0, closingBodyIndex)));
          sendScripts(controller, true);
          controller.enqueue(encoder.encode(data.slice(closingBodyIndex)));
          data = '';
        }
      },
    });
  };
  return [copied, interleave] as const;
};

// HACK for now, do we want to use HTML parser?
const rectifyHtml = () => {
  const pending: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      pending.push(chunk);
      if (/<\/\w+>$/.test(decoder.decode(chunk))) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          controller.enqueue(concatUint8Arrays(pending.splice(0)));
        });
      }
    },
    flush(controller) {
      clearTimeout(timer);
      if (pending.length) {
        controller.enqueue(concatUint8Arrays(pending.splice(0)));
      }
    },
  });
};

const buildHtml = (
  createElement: typeof createElementType,
  head: string,
  body: ReactNode,
) =>
  createElement(
    'html',
    null,
    createElement('head', { dangerouslySetInnerHTML: { __html: head } }),
    createElement('body', null, body),
  );

export const renderHtml = async (
  opts: {
    config: ResolvedConfig;
    pathname: string;
    searchParams: URLSearchParams;
    htmlHead: string;
    renderRscForHtml: (
      input: string,
      searchParams: URLSearchParams,
    ) => Promise<ReadableStream>;
    getSsrConfigForHtml: (
      pathname: string,
      searchParams: URLSearchParams,
    ) => Promise<{
      input: string;
      searchParams?: URLSearchParams;
      body: ReadableStream;
    } | null>;
    loadClientModule: (key: CLIENT_MODULE_KEY) => Promise<unknown>;
  } & (
    | { isDev: false; loadModule: EntriesPrd['loadModule'] }
    | {
        isDev: true;
        rootDir: string;
        loadServerFile: (fileURL: string) => Promise<unknown>;
      }
  ),
): Promise<ReadableStream | null> => {
  const {
    config,
    pathname,
    searchParams,
    htmlHead,
    renderRscForHtml,
    getSsrConfigForHtml,
    loadClientModule,
    isDev,
  } = opts;

  const [
    {
      default: { createElement },
    },
    {
      default: { renderToReadableStream },
    },
    {
      default: { createFromReadableStream },
    },
    { ServerRoot },
  ] = await Promise.all([
    loadClientModule('react') as Promise<{ default: typeof ReactType }>,
    loadClientModule('rd-server') as Promise<{ default: typeof RDServerType }>,
    loadClientModule('rsdw-client') as Promise<{
      default: typeof RSDWClientType;
    }>,
    loadClientModule('waku-client') as Promise<typeof WakuClientType>,
  ]);
  const ssrConfig = await getSsrConfigForHtml?.(pathname, searchParams);
  if (!ssrConfig) {
    return null;
  }
  let stream: ReadableStream;
  try {
    stream = await renderRscForHtml(
      ssrConfig.input,
      ssrConfig.searchParams || searchParams,
    );
  } catch (e) {
    if (hasStatusCode(e) && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
  const moduleMap = new Proxy(
    {} as Record<
      string,
      Record<
        string,
        {
          id: string;
          chunks: string[];
          name: string;
        }
      >
    >,
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              const file = filePath.slice(config.basePath.length);
              // TODO too long, we need to refactor this logic
              if (isDev) {
                const filePath = file.startsWith('@fs/')
                  ? file.slice('@fs'.length)
                  : joinPath(opts.rootDir, file);
                const wakuDist = joinPath(
                  fileURLToFilePath(import.meta.url),
                  '../../..',
                );
                if (filePath.startsWith(wakuDist)) {
                  const id =
                    'waku' +
                    filePath.slice(wakuDist.length).replace(/\.\w+$/, '');
                  if (!moduleLoading.has(id)) {
                    moduleLoading.set(
                      id,
                      import(id).then((m) => {
                        moduleCache.set(id, m);
                      }),
                    );
                  }
                  return { id, chunks: [id], name };
                }
                const id = filePathToFileURL(filePath);
                if (!moduleLoading.has(id)) {
                  moduleLoading.set(
                    id,
                    opts.loadServerFile(id).then((m) => {
                      moduleCache.set(id, m);
                    }),
                  );
                }
                return { id, chunks: [id], name };
              }
              // !isDev
              const id = file;
              if (!moduleLoading.has(id)) {
                moduleLoading.set(
                  id,
                  opts
                    .loadModule(joinPath(config.ssrDir, id))
                    .then((m: any) => {
                      moduleCache.set(id, m);
                    }),
                );
              }
              return { id, chunks: [id], name };
            },
          },
        );
      },
    },
  );
  const [copied, interleave] = injectRscPayload(
    stream,
    config.basePath + config.rscPath + '/' + encodeInput(ssrConfig.input),
  );
  const elements: Promise<Record<string, ReactNode>> = createFromReadableStream(
    copied,
    {
      ssrManifest: { moduleMap, moduleLoading: null },
    },
  );
  const body: Promise<ReactNode> = createFromReadableStream(ssrConfig.body, {
    ssrManifest: { moduleMap, moduleLoading: null },
  });
  const readable = (
    await renderToReadableStream(
      buildHtml(
        createElement,
        htmlHead,
        createElement(
          ServerRoot as FunctionComponent<
            Omit<ComponentProps<typeof ServerRoot>, 'children'>
          >,
          { elements },
          body as any,
        ),
      ),
      {
        onError(err: unknown) {
          console.error(err);
        },
      },
    )
  )
    .pipeThrough(rectifyHtml())
    .pipeThrough(interleave());
  return readable;
};
