import path from 'node:path'; // TODO no node dependency
import url from 'node:url'; // TODO no node dependency

import { createElement } from 'react';
import type { ReactNode, FunctionComponent, ComponentProps } from 'react';
import RDServer from 'react-dom/server.edge';
import RSDWClient from 'react-server-dom-webpack/client.edge';
import type { ViteDevServer } from 'vite';

import { resolveConfig, viteInlineConfig } from '../../config.js';
import { defineEntries } from '../../../server.js';
import { ServerRoot } from '../../../client.js';
import { renderRSC } from './worker-api.js';
import { hasStatusCode, concatUint8Arrays, normalizePath } from './utils.js';

const { renderToReadableStream } = RDServer;
const { createFromReadableStream } = RSDWClient;

// HACK for react-server-dom-webpack without webpack
const moduleCache = new Map();
(globalThis as any).__webpack_chunk_load__ ||= async (id: string) => {
  const [filePath, command] = id.split('#');
  const m = await loadServerFile(filePath!, (command as any) || 'start');
  moduleCache.set(id, m);
};
(globalThis as any).__webpack_require__ ||= (id: string) => moduleCache.get(id);

type Entries = {
  default: ReturnType<typeof defineEntries>;
  resolveClientPath?: (
    filePath: string,
    invert?: boolean,
  ) => string | undefined;
};

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const { Server } = await import('node:http');
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: viteCreateServer } = await import('vite');
  const { nonjsResolvePlugin } = await import(
    '../../vite-plugin/nonjs-resolve-plugin.js'
  );
  const viteServer = await viteCreateServer({
    ...viteInlineConfig(),
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

export const shutdown = async () => {
  if (lastViteServer) {
    await lastViteServer.close();
    lastViteServer = undefined;
  }
};

const loadServerFile = async (
  fname: string,
  command: 'dev' | 'build' | 'start',
) => {
  if (command !== 'dev') {
    return import(fname);
  }
  const vite = await getViteServer();
  return vite.ssrLoadModule(fname);
};

const getEntriesFile = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: 'dev' | 'build' | 'start',
) => {
  const filePath = path.join(
    config.rootDir,
    command === 'dev' ? config.srcDir : config.distDir,
    config.entriesJs,
  );
  return command === 'dev' ? filePath : url.pathToFileURL(filePath).toString();
};

const fakeFetchCode = `
Promise.resolve({
  ok: true,
  body: new ReadableStream({
    start(c) {
      const f = (s) => new TextEncoder().encode(decodeURI(s));
      globalThis.__WAKU_PUSH__ = (s) => s ? c.enqueue(f(s)) : c.close();
    }
  })
})
`
  .split('\n')
  .map((line) => line.trim())
  .join('');

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
      /(.*)<script>\nglobalThis\.__WAKU_PREFETCHED__ = {\n(.*?)\n};(.*)/s,
    );
    let prefetchedLines: string[] = [];
    if (matchPrefetched) {
      prefetchedLines = matchPrefetched[2]!.split('\n');
      data = matchPrefetched[1] + '<script>\n' + matchPrefetched[3];
    }
    const closingHeadIndex = data.indexOf('</head>');
    if (closingHeadIndex === -1) {
      throw new Error('closing head not found');
    }
    data =
      data.slice(0, closingHeadIndex) +
      `
<script>
globalThis.__WAKU_PREFETCHED__ = {
${prefetchedLines
  .filter((line) => !line.startsWith(`  '${input}':`))
  .join('\n')}
  '${input}': ${fakeFetchCode},
};
globalThis.__WAKU_SSR_ENABLED__ = true;
</script>
` +
      data.slice(closingHeadIndex);
    return data;
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const getScripts = (): string => {
    const scripts = chunks.splice(0).map(
      (chunk) =>
        `
<script>globalThis.__WAKU_PUSH__("${encodeURI(
          decoder.decode(chunk),
        )}")</script>`,
    );
    if (closed) {
      scripts.push(
        `
<script>globalThis.__WAKU_PUSH__()</script>`,
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
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: 'dev' | 'build' | 'start',
  pathStr: string,
  htmlStr: string, // Hope stream works, but it'd be too tricky
  context: Context,
): Promise<readonly [ReadableStream, Context] | null> => {
  const entriesFile = getEntriesFile(config, command);
  const {
    default: { getSsrConfig },
    resolveClientPath,
  } = await (loadServerFile(entriesFile, command) as Promise<Entries>);
  const ssrConfig = await getSsrConfig?.(pathStr);
  if (!ssrConfig) {
    return null;
  }
  let stream: ReadableStream;
  let nextCtx: Context;
  try {
    [stream, nextCtx] = await renderRSC({
      input: ssrConfig.input,
      method: 'GET',
      headers: {},
      command,
      context,
    });
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
              if (command === 'dev') {
                const filePath = normalizePath(
                  file.startsWith('@fs/')
                    ? // FIXME This is ugly. We need to refactor it.
                      // remove '@fs'(3) on Unix and '@fs/'(4) on Windows
                      file.slice(path.sep === '/' ? 3 : 4)
                    : path.join(config.rootDir, config.srcDir, file),
                );
                // FIXME This is ugly. We need to refactor it.
                const wakuDist = normalizePath(
                  path.join(
                    url.fileURLToPath(import.meta.url),
                    '..',
                    '..',
                    '..',
                    '..',
                  ),
                );
                if (filePath.startsWith(wakuDist)) {
                  const id =
                    'waku' +
                    filePath.slice(wakuDist.length).replace(/\.\w+$/, '');
                  return { id, chunks: [id], name };
                }
                const id =
                  url
                    .pathToFileURL(filePath)
                    .toString()
                    .slice('file://'.length) + '#dev';
                return { id, chunks: [id], name };
              }
              // command !== 'dev'
              const origFile = resolveClientPath?.(
                path.join(config.rootDir, config.distDir, file),
                true,
              );
              if (
                origFile &&
                !origFile.startsWith(path.join(config.rootDir, config.srcDir))
              ) {
                const id = url.pathToFileURL(origFile).toString();
                return { id, chunks: [id], name };
              }
              const id = url
                .pathToFileURL(path.join(config.rootDir, config.distDir, file))
                .toString();
              return { id, chunks: [id], name };
            },
          },
        );
      },
    },
  );
  const [copied, interleave] = injectRscPayload(stream, ssrConfig.input);
  const elements = createFromReadableStream<Record<string, ReactNode>>(copied, {
    ssrManifest: { moduleMap, moduleLoading: null },
  });
  const readable = (
    await renderToReadableStream(
      createElement(
        ServerRoot as FunctionComponent<
          Omit<ComponentProps<typeof ServerRoot>, 'children'>
        >,
        { elements },
        ssrConfig.unstable_render(),
      ),
    )
  )
    .pipeThrough(rectifyHtml())
    .pipeThrough(interleave(...splitHTML(htmlStr)));
  return [readable, nextCtx];
};
