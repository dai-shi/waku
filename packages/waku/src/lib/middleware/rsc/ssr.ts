import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import crypto from 'node:crypto';
import { PassThrough, Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import { Server } from 'node:http';

import { createElement } from 'react';
import RDServer from 'react-dom/server';
import RSDWClient from 'react-server-dom-webpack/client.node.unbundled';
import type { ViteDevServer } from 'vite';

import { resolveConfig } from '../../config.js';
import { defineEntries } from '../../../server.js';
import { renderRSC } from './worker-api.js';
import { hasStatusCode } from './utils.js';

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

type Entries = { default: ReturnType<typeof defineEntries> };

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: viteCreateServer } = await import('vite');
  const { nonjsResolvePlugin } = await import(
    '../../vite-plugin/nonjs-resolve-plugin.js'
  );
  const viteServer = await viteCreateServer({
    plugins: [nonjsResolvePlugin()],
    ssr: {
      // HACK required for ServerRoot for waku/client
      noExternal: ['waku'],
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

// This is exported only for createTranspiler
export const loadServerFile = async (
  fname: string,
  command: 'dev' | 'build' | 'start',
) => {
  if (command !== 'dev') {
    return import(fname);
  }
  const vite = await getViteServer();
  return vite.ssrLoadModule(fname);
};

// FIXME this is very hacky
const createTranspiler = async (cleanupFns: Set<() => void>) => {
  return (file: string, name: string) => {
    const temp = path.resolve(
      `.temp-${crypto.randomBytes(8).toString('hex')}.js`,
    );
    const code = `
import { loadServerFile } from '${url.fileURLToPath(import.meta.url)}';
const { ${name} } = await loadServerFile('${file}', 'dev');
export { ${name} }
`;
    fs.writeFileSync(temp, code);
    cleanupFns.add(() => fs.unlinkSync(temp));
    return temp;
  };
};

const getEntriesFile = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: 'dev' | 'build' | 'start',
) => {
  return path.join(
    config.rootDir,
    command === 'dev' ? config.srcDir : config.distDir,
    config.entriesJs,
  );
};

const getWakuClientFile = (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: 'dev' | 'build' | 'start',
) => {
  if (command !== 'dev') {
    // HACK kind of hard coded to be sync with builder.ts
    return path.join(config.rootDir, config.distDir, './assets/waku-client.js');
  }
  return 'waku/client';
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

const injectRscPayload = (stream: Readable, input: string) => {
  const chunks: Buffer[] = [];
  let closed = false;
  let notify: (() => void) | undefined;
  const copied = new PassThrough();
  stream.on('data', (chunk) => {
    copied.write(chunk);
    chunks.push(chunk);
    notify?.();
  });
  stream.on('end', () => {
    copied.end();
    closed = true;
    notify?.();
  });
  let prefetchedLines: string[] = [];
  let headSent = false;
  let closedSent = false;
  const inject = new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ('buffer' as any)) {
        throw new Error('Unknown encoding');
      }
      if (!headSent) {
        let data: string = chunk.toString();
        const matchPrefetched = data.match(
          // HACK This is very brittle
          /(.*)<script>\nglobalThis\.__WAKU_PREFETCHED__ = {\n(.*?)\n};(.*)/s,
        );
        if (matchPrefetched) {
          prefetchedLines = matchPrefetched[2]!.split('\n');
          data = matchPrefetched[1] + '<script>\n' + matchPrefetched[3];
        }
        const closingHeadIndex = data.indexOf('</head>');
        if (closingHeadIndex >= 0) {
          headSent = true;
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
          callback(null, Buffer.from(data));
          notify = () => {
            const scripts = chunks.splice(0).map((chunk) =>
              Buffer.from(`
<script>globalThis.__WAKU_PUSH__("${encodeURI(chunk.toString())}")</script>`),
            );
            if (closed) {
              closedSent = true;
              scripts.push(
                Buffer.from(`
<script>globalThis.__WAKU_PUSH__()</script>`),
              );
            }
            this.push(Buffer.concat(scripts));
          };
          notify();
          return;
        } else if (matchPrefetched) {
          callback(null, Buffer.from(data));
          return;
        }
      }
      callback(null, chunk);
    },
    final(callback) {
      if (!closedSent) {
        const notifyOrig = notify;
        notify = () => {
          notifyOrig?.();
          if (closedSent) {
            callback();
          }
        };
      } else {
        callback();
      }
    },
  });
  return [copied, inject] as const;
};

const interleaveHtmlSnippets = (
  preamble: string,
  intermediate: string,
  postamble: string,
) => {
  let preambleSent = false;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ('buffer' as any)) {
        throw new Error('Unknown encoding');
      }
      if (!preambleSent) {
        const data = chunk.toString();
        preambleSent = true;
        callback(
          null,
          Buffer.concat([
            Buffer.from(preamble),
            Buffer.from(data),
            Buffer.from(intermediate),
          ]),
        );
        return;
      }
      callback(null, chunk);
    },
    final(callback) {
      if (!preambleSent) {
        this.push(
          Buffer.concat([
            Buffer.from(preamble),
            Buffer.from(intermediate),
            Buffer.from(postamble),
          ]),
        );
      } else {
        this.push(Buffer.from(postamble));
      }
      callback();
    },
  });
};

// HACK for now, do we want to use HTML parser?
const rectifyHtml = () => {
  const pending: Buffer[] = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ('buffer' as any)) {
        throw new Error('Unknown encoding');
      }
      pending.push(chunk);
      if (/<\/\w+>$/.test(chunk.toString())) {
        callback(null, Buffer.concat(pending.splice(0)));
      } else {
        callback();
      }
    },
    final(callback) {
      if (!pending.length) {
        this.push(Buffer.concat(pending.splice(0)));
      }
      callback();
    },
  });
};

export const renderHtml = async <Context>(
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: 'dev' | 'build' | 'start',
  pathStr: string,
  htmlStr: string, // Hope stream works, but it'd be too tricky
  context: Context,
): Promise<readonly [Readable, Context] | null> => {
  const entriesFile = getEntriesFile(config, command);
  const {
    default: { getSsrConfig },
  } = await (loadServerFile(entriesFile, command) as Promise<Entries>);
  const ssrConfig = await getSsrConfig?.(pathStr);
  if (!ssrConfig) {
    return null;
  }
  let pipeable: Readable;
  let nextCtx: Context;
  try {
    [pipeable, nextCtx] = await renderRSC({
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
  const cleanupFns = new Set<() => void>();
  const transpile =
    command === 'dev' ? await createTranspiler(cleanupFns) : undefined;
  const moduleMap = new Proxy(
    {},
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              const file = filePath.slice(config.basePath.length);
              if (command !== 'dev') {
                return {
                  specifier: path.join(config.rootDir, config.distDir, file),
                  name,
                };
              }
              // command === "dev"
              const f = file.startsWith('@fs/')
                ? file.slice(3)
                : path.join(config.rootDir, config.srcDir, file);
              return { specifier: transpile!(f, name), name };
            },
          },
        );
      },
    },
  );
  const [copied, inject] = injectRscPayload(pipeable, ssrConfig.input);
  const elements = createFromNodeStream(copied, { moduleMap });
  const { ServerRoot } = await loadServerFile(
    getWakuClientFile(config, command),
    command,
  );
  const readable = renderToPipeableStream(
    createElement(ServerRoot, { elements }, ssrConfig.unstable_render()),
    {
      onAllReady: () => {
        cleanupFns.forEach((fn) => fn());
        cleanupFns.clear();
      },
      onError(err) {
        cleanupFns.forEach((fn) => fn());
        cleanupFns.clear();
        console.error(err);
      },
    },
  )
    .pipe(rectifyHtml())
    .pipe(interleaveHtmlSnippets(...splitHTML(htmlStr)))
    .pipe(inject);
  return [readable, nextCtx];
};
