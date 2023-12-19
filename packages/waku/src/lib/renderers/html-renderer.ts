import type {
  createElement as createElementType,
  ReactNode,
  FunctionComponent,
  ComponentProps,
} from 'react';
import type { ViteDevServer } from 'vite';

import type { ResolvedConfig } from '../config.js';
import type { EntriesDev, EntriesPrd } from '../../server.js';
import { concatUint8Arrays } from '../utils/stream.js';
import {
  decodeFilePathFromAbsolute,
  joinPath,
  filePathToFileURL,
  fileURLToFilePath,
} from '../utils/path.js';
import { hasStatusCode } from './utils.js';

export const REACT_MODULE = 'react';
export const REACT_MODULE_VALUE = 'react';
export const RD_SERVER_MODULE = 'rd-server';
export const RD_SERVER_MODULE_VALUE = 'react-dom/server.edge';
export const RSDW_CLIENT_MODULE = 'rsdw-client';
export const RSDW_CLIENT_MODULE_VALUE = 'react-server-dom-webpack/client.edge';
export const WAKU_CLIENT_MODULE = 'waku-client';
export const WAKU_CLIENT_MODULE_VALUE = 'waku/client';

// HACK for react-server-dom-webpack without webpack
const moduleLoading = new Map();
const moduleCache = new Map();
(globalThis as any).__webpack_chunk_load__ = async (id: string) =>
  moduleLoading.get(id);
(globalThis as any).__webpack_require__ = (id: string) => moduleCache.get(id);

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const { Server } = await import('node:http').catch((e) => {
    // XXX explicit catch to avoid bundle time error
    throw e;
  });
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: createViteServer } = await import('vite').catch((e) => {
    // XXX explicit catch to avoid bundle time error
    throw e;
  });
  const { nonjsResolvePlugin } = await import(
    '../plugins/vite-plugin-nonjs-resolve.js'
  );
  const viteServer = await createViteServer({
    plugins: [nonjsResolvePlugin()],
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

const loadServerFileDev = async (fileURL: string) => {
  const vite = await getViteServer();
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

// TODO this is an easy solution. we could do it better at the build time.
const enableSsrCode = 'globalThis.__WAKU_SSR_ENABLED__ = true;';

const injectRscPayload = (readable: ReadableStream, input: string) => {
  const chunks: Uint8Array[] = [];
  let closed = false;
  let notify: (() => void) | undefined;
  const copied = readable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        chunks.push(chunk);
        notify?.();
        controller.enqueue(chunk);
      },
      flush() {
        closed = true;
        notify?.();
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
        `  '${input}': ${fakeFetchCode},` +
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
  '${input}': ${fakeFetchCode},
};
`;
    }
    if (!data.includes(enableSsrCode)) {
      code += enableSsrCode;
    }
    if (code) {
      data =
        data.slice(0, closingHeadIndex) +
        `<script type="module" async>${code}</script>` +
        data.slice(closingHeadIndex);
    }
    return data;
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const getScripts = (): string => {
    const scripts = chunks.splice(0).map(
      (chunk) =>
        `
<script type="module" async>globalThis.__WAKU_PUSH__("${encodeURI(
          decoder.decode(chunk),
        )}")</script>`,
    );
    if (closed) {
      scripts.push(
        `
<script type="module" async>globalThis.__WAKU_PUSH__()</script>`,
      );
    }
    return scripts.join('');
  };
  const interleave = () => {
    let headSent = false;
    let data = '';
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        if (!headSent) {
          data += decoder.decode(chunk);
          if (!data.includes('</head>')) {
            return;
          }
          headSent = true;
          controller.enqueue(encoder.encode(modifyHead(data)));
          data = '';
          notify = () => controller.enqueue(encoder.encode(getScripts()));
          notify();
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        if (!headSent) {
          throw new Error('head not yet sent');
        }
        if (!closed) {
          return new Promise<void>((resolve) => {
            notify = () => {
              controller.enqueue(encoder.encode(getScripts()));
              if (closed) {
                resolve();
              }
            };
          });
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
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      pending.push(chunk);
      if (/<\/\w+>$/.test(decoder.decode(chunk))) {
        controller.enqueue(concatUint8Arrays(pending.splice(0)));
      }
    },
    flush(controller) {
      if (!pending.length) {
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
    reqUrl: URL;
    htmlHead: string;
    renderRscForHtml: (input: string) => Promise<ReadableStream>;
  } & (
    | { isDev: false; entries: EntriesPrd }
    | { isDev: true; entries: EntriesDev }
  ),
): Promise<ReadableStream | null> => {
  const { config, reqUrl, htmlHead, renderRscForHtml, isDev, entries } = opts;

  const {
    default: { getSsrConfig },
    loadModule,
  } = entries as (EntriesDev & { loadModule: undefined }) | EntriesPrd;
  const [
    { createElement },
    { renderToReadableStream },
    { createFromReadableStream },
    { ServerRoot, Slot },
  ] = await Promise.all([
    isDev
      ? import(REACT_MODULE_VALUE)
      : loadModule!('public/' + REACT_MODULE).then((m: any) => m.default),
    isDev
      ? import(RD_SERVER_MODULE_VALUE)
      : loadModule!('public/' + RD_SERVER_MODULE).then((m: any) => m.default),
    isDev
      ? import(RSDW_CLIENT_MODULE_VALUE)
      : loadModule!('public/' + RSDW_CLIENT_MODULE).then((m: any) => m.default),
    isDev
      ? import(WAKU_CLIENT_MODULE_VALUE)
      : loadModule!('public/' + WAKU_CLIENT_MODULE),
  ]);
  const ssrConfig = await getSsrConfig?.(reqUrl);
  if (!ssrConfig) {
    return null;
  }
  const rootDirDev = isDev && (await getViteServer()).config.root;
  let stream: ReadableStream;
  try {
    stream = await renderRscForHtml(ssrConfig.input);
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
                    loadServerFileDev(id).then((m) => {
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
                  loadModule!('public/' + id).then((m: any) => {
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
  const [copied, interleave] = injectRscPayload(stream, ssrConfig.input);
  const elements: Promise<Record<string, ReactNode>> = createFromReadableStream(
    copied,
    {
      ssrManifest: { moduleMap, moduleLoading: null },
    },
  );
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
          ssrConfig.unstable_render({ createElement, Slot }),
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
