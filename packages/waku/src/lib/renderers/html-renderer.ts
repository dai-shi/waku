import type { ReactNode, FunctionComponent, ComponentProps } from 'react';
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
import { renderRscWithWorker } from '../rsc/worker-api.js';
import { renderRsc } from './rsc-renderer.js';
import { hasStatusCode, deepFreeze } from './utils.js';

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
  const interleave = (
    preamble: string,
    intermediate: string,
    postamble: string,
  ) => {
    let preambleSent = false;
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        if (!preambleSent) {
          preambleSent = true;
          controller.enqueue(
            concatUint8Arrays([
              encoder.encode(modifyHead(preamble)),
              chunk,
              encoder.encode(intermediate),
            ]),
          );
          notify = () => controller.enqueue(encoder.encode(getScripts()));
          notify();
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        if (!preambleSent) {
          throw new Error('preamble not yet sent');
        }
        if (!closed) {
          return new Promise<void>((resolve) => {
            notify = () => {
              controller.enqueue(encoder.encode(getScripts()));
              if (closed) {
                controller.enqueue(encoder.encode(postamble));
                resolve();
              }
            };
          });
        }
        controller.enqueue(encoder.encode(postamble));
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

export const renderHtml = async <Context>(
  opts: {
    config: ResolvedConfig;
    pathStr: string;
    htmlStr: string; // Hope stream works, but it'd be too tricky
    context: Context;
  } & (
    | { isDev: false; entries: EntriesPrd }
    | { isDev: true; entries: EntriesDev }
  ),
): Promise<readonly [ReadableStream, Context] | null> => {
  const { config, pathStr, htmlStr, context, isDev, entries } = opts;

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
  const ssrConfig = await getSsrConfig?.(pathStr);
  if (!ssrConfig) {
    return null;
  }
  const rootDirDev = isDev && (await getViteServer()).config.root;
  let stream: ReadableStream;
  let nextCtx: Context;
  try {
    if (isDev) {
      [stream, nextCtx] = await renderRscWithWorker({
        input: ssrConfig.input,
        method: 'GET',
        contentType: undefined,
        config,
        context,
      });
    } else {
      stream = await renderRsc({
        entries,
        config,
        input: ssrConfig.input,
        method: 'GET',
        context,
        isDev: false,
      });
      deepFreeze(context);
      nextCtx = context;
    }
  } catch (e) {
    if (hasStatusCode(e) && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
  const { splitHTML } = config.ssr;
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
      createElement(
        ServerRoot as FunctionComponent<
          Omit<ComponentProps<typeof ServerRoot>, 'children'>
        >,
        { elements },
        ssrConfig.unstable_render({ createElement, Slot }),
      ),
      {
        onError(err: unknown) {
          console.error(err);
        },
      },
    )
  )
    .pipeThrough(rectifyHtml())
    .pipeThrough(interleave(...splitHTML(htmlStr)));
  return [readable, nextCtx];
};
