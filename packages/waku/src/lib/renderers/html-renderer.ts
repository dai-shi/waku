import type {
  createElement as createElementType,
  ReactNode,
  FunctionComponent,
  ComponentProps,
} from 'react';
import type { ViteDevServer, InlineConfig } from 'vite';

import type { ResolvedConfig } from '../config.js';
import type { EntriesPrd } from '../../server.js';
import { concatUint8Arrays } from '../utils/stream.js';
import {
  decodeFilePathFromAbsolute,
  joinPath,
  filePathToFileURL,
  fileURLToFilePath,
} from '../utils/path.js';
import { encodeInput, hasStatusCode } from './utils.js';

export const REACT_MODULE = 'react';
export const REACT_MODULE_VALUE = 'react';
export const RD_SERVER_MODULE = 'rd-server';
export const RD_SERVER_MODULE_VALUE = 'react-dom/server.edge';
export const RSDW_CLIENT_MODULE = 'rsdw-client';
export const RSDW_CLIENT_MODULE_VALUE = 'react-server-dom-webpack/client.edge';
export const WAKU_CLIENT_MODULE = 'waku-client';
export const WAKU_CLIENT_MODULE_VALUE = 'waku/client';

// HACK for react-server-dom-webpack without webpack
(globalThis as any).__webpack_module_loading__ ||= new Map();
(globalThis as any).__webpack_module_cache__ ||= new Map();
(globalThis as any).__webpack_chunk_load__ ||= async (id: string) =>
  (globalThis as any).__webpack_module_loading__.get(id);
(globalThis as any).__webpack_require__ ||= (id: string) =>
  (globalThis as any).__webpack_module_cache__.get(id);
const moduleLoading = (globalThis as any).__webpack_module_loading__;
const moduleCache = (globalThis as any).__webpack_module_cache__;

type CreateViteServer = (
  inlineConfig?: InlineConfig | undefined,
) => Promise<ViteDevServer>;

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async (createViteServer: CreateViteServer) => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const { Server } = await import('node:http').catch((e) => {
    // XXX explicit catch to avoid bundle time error
    throw e;
  });
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  // HACK to avoid bundling
  const VITE_PLUGIN_NONJS_RESOLVE_MODULE_VALUE =
    '../plugins/vite-plugin-nonjs-resolve.js';
  const VITE_PLUGIN_RSC_ENV_MODULE_VALUE = '../plugins/vite-plugin-rsc-env.js';
  const { nonjsResolvePlugin } = await import(
    VITE_PLUGIN_NONJS_RESOLVE_MODULE_VALUE
  );
  const { rscEnvPlugin } = await import(VITE_PLUGIN_RSC_ENV_MODULE_VALUE);
  const viteServer = await createViteServer({
    plugins: [nonjsResolvePlugin(), rscEnvPlugin({})],
    // HACK to suppress 'Skipping dependency pre-bundling' warning
    optimizeDeps: { include: [] },
    ssr: {
      external: ['waku'],
    },
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  await viteServer.watcher.close(); // TODO watch: null
  await viteServer.ws.close();
  lastViteServer = viteServer;
  return viteServer;
};

const loadServerFileDev = async (
  fileURL: string,
  createViteServer: CreateViteServer,
) => {
  const vite = await getViteServer(createViteServer);
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
};

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
  body: Promise<ReactNode>,
) =>
  createElement(
    'html',
    null,
    createElement('head', { dangerouslySetInnerHTML: { __html: head } }),
    createElement('body', null, body as any),
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
  } & (
    | { isDev: false; loadModule: EntriesPrd['loadModule']; isBuild: boolean }
    | { isDev: true; createViteServer: CreateViteServer }
  ),
): Promise<ReadableStream | null> => {
  const {
    config,
    pathname,
    searchParams,
    htmlHead,
    renderRscForHtml,
    getSsrConfigForHtml,
    isDev,
  } = opts;

  const [
    { createElement },
    { renderToReadableStream },
    { createFromReadableStream },
    { ServerRoot },
  ] = await Promise.all([
    isDev
      ? import(REACT_MODULE_VALUE)
      : opts.loadModule('public/' + REACT_MODULE).then((m: any) => m.default),
    isDev
      ? import(RD_SERVER_MODULE_VALUE)
      : opts
          .loadModule('public/' + RD_SERVER_MODULE)
          .then((m: any) => m.default),
    isDev
      ? import(RSDW_CLIENT_MODULE_VALUE)
      : opts
          .loadModule('public/' + RSDW_CLIENT_MODULE)
          .then((m: any) => m.default),
    isDev
      ? import(WAKU_CLIENT_MODULE_VALUE)
      : opts.loadModule('public/' + WAKU_CLIENT_MODULE),
  ]);
  const ssrConfig = await getSsrConfigForHtml?.(pathname, searchParams);
  if (!ssrConfig) {
    return null;
  }
  const rootDirDev =
    isDev && (await getViteServer(opts.createViteServer)).config.root;
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
                if (!rootDirDev) {
                  throw new Error('rootDirDev is not defined');
                }
                const filePath = file.startsWith('@fs/')
                  ? decodeFilePathFromAbsolute(file.slice('@fs'.length))
                  : joinPath(rootDirDev, file);
                const wakuDist = decodeFilePathFromAbsolute(
                  joinPath(fileURLToFilePath(import.meta.url), '../../..'),
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
                    loadServerFileDev(id, opts.createViteServer).then((m) => {
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
                  opts.loadModule('public/' + id).then((m: any) => {
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
          body,
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
