import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { PassThrough, Transform } from "node:stream";
import type { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import { Server } from "node:http";

import { createElement } from "react";
import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";
import type { ViteDevServer } from "vite";

import { resolveConfig } from "../../config.js";
import { defineEntries } from "../../../server.js";
import { renderRSC } from "./worker-api.js";
import { hasStatusCode } from "./utils.js";

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

type Entries = { default: ReturnType<typeof defineEntries> };

const createResolvedPromise = <T>(value: T) => {
  const promise = Promise.resolve(value);
  (promise as any).status = "fulfilled";
  (promise as any).value = value;
  return promise;
};

let lastViteServer: [vite: ViteDevServer, command: "dev" | "build"] | undefined;

const getViteServer = async (command: "dev" | "build") => {
  if (lastViteServer) {
    if (lastViteServer[1] === command) {
      return lastViteServer[0];
    }
    console.warn("Restarting Vite server with different command");
    await lastViteServer[0].close();
  }
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: viteCreateServer } = await import("vite");
  const { nonjsResolvePlugin } = await import(
    "../../vite-plugin/nonjs-resolve-plugin.js"
  );
  const viteServer = await viteCreateServer({
    plugins: [...(command === "dev" ? [nonjsResolvePlugin()] : [])],
    appType: "custom",
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  await viteServer.watcher.close(); // TODO watch: null
  await viteServer.ws.close();
  lastViteServer = [viteServer, command];
  return viteServer;
};

export const shutdown = async () => {
  if (lastViteServer) {
    await lastViteServer[0].close();
    lastViteServer = undefined;
  }
};

const loadEntriesFile = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start",
): Promise<Entries> => {
  const fname = path.join(
    config.rootDir,
    command === "dev" ? config.srcDir : config.distDir,
    config.entriesJs,
  );
  if (command === "start") {
    return import(fname);
  }
  const vite = await getViteServer(command);
  return vite.ssrLoadModule(fname) as any;
};

// FIXME this is too hacky
const createTranspiler = async (cleanupFns: Set<() => void>) => {
  const swc = await import("@swc/core");
  return (file: string) => {
    const ext = path.extname(file);
    const temp = path.resolve(
      `.temp-${crypto.randomBytes(8).toString("hex")}.js`,
    );
    const { code } = swc.transformFileSync(file, {
      jsc: {
        parser: {
          syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
          tsx: ext === ".tsx",
        },
        transform: {
          react: {
            runtime: "automatic",
          },
        },
      },
    });
    fs.writeFileSync(temp, code);
    cleanupFns.add(() => fs.unlinkSync(temp));
    return temp;
  };
};

const fakeFetchCode = `
Promise.resolve({
  ok: true, body:
  new ReadableStream({
    start(c) {
      const f = (s) => new TextEncoder().encode(s);
      globalThis.__WAKU_PUSH__ = (s) => s ? c.enqueue(f(s)) : c.close();
    }
  })
})
`
  .split("\n")
  .map((line) => line.trim())
  .join("");

const injectRscPayload = (stream: Readable, input: string) => {
  const chunks: Buffer[] = [];
  let closed = false;
  let notify: (() => void) | undefined;
  const copied = new PassThrough();
  stream.on("data", (chunk) => {
    copied.write(chunk);
    chunks.push(chunk);
    notify?.();
  });
  stream.on("end", () => {
    copied.end();
    closed = true;
    notify?.();
  });
  let prefetchedLines: string[] = [];
  let headSent = false;
  let closedSent = false;
  const inject = new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      if (!headSent) {
        let data: string = chunk.toString();
        const matchPrefetched = data.match(
          // FIXME This is very ad-hoc.
          /(.*)<script>\nglobalThis\.__WAKU_PREFETCHED__ = {\n(.*?)\n};(.*)/s,
        );
        if (matchPrefetched) {
          prefetchedLines = matchPrefetched[2]!.split("\n");
          data = matchPrefetched[1] + "<script>\n" + matchPrefetched[3];
        }
        const closingHeadIndex = data.indexOf("</head>");
        if (closingHeadIndex >= 0) {
          headSent = true;
          data =
            data.slice(0, closingHeadIndex) +
            `
<script>
globalThis.__WAKU_PREFETCHED__ = {
${prefetchedLines
  .filter((line) => !line.startsWith(`  '${input}':`))
  .join("\n")}
  '${input}': ${fakeFetchCode},
};
globalThis.__WAKU_SSR_ENABLED__ = true;
</script>
` +
            data.slice(closingHeadIndex);
          callback(null, Buffer.from(data));
          notify = () => {
            const scripts = chunks.splice(0).map((chunk) => {
              const s = chunk.toString().replace(/`/g, "\\`");
              return Buffer.from(`
<script>globalThis.__WAKU_PUSH__(\`${s}\`)</script>`);
            });
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
      if (!closedSent && notify) {
        const notifyOrig = notify;
        notify = () => {
          notifyOrig();
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
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
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

export const renderHtml = async <Context>(
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start",
  pathStr: string,
  htmlStr: string, // Hope stream works, but it'd be too tricky
  context: Context,
): Promise<readonly [Readable, Context] | null> => {
  const {
    default: { getSsrConfig },
  } = await loadEntriesFile(config, command);
  const ssrConfig = await getSsrConfig?.(pathStr);
  if (!ssrConfig) {
    return null;
  }
  let pipeable: Readable;
  let nextCtx: Context;
  try {
    [pipeable, nextCtx] = await renderRSC({
      input: ssrConfig.input,
      method: "GET",
      headers: {},
      command,
      context,
      ssr: true,
    });
  } catch (e) {
    if (hasStatusCode(e) && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
  const { splitHTML } = config.ssr;
  const cleanupFns = new Set<() => void>();
  const transpile = command === "dev" && (await createTranspiler(cleanupFns));
  const moduleMap = new Proxy(
    {},
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              const file = filePath.slice(config.basePath.length);
              if (command === "dev" && file.startsWith("@fs/")) {
                return { specifier: file.slice(3), name };
              }
              const f = path.join(
                config.rootDir,
                command === "dev" ? config.srcDir : config.distDir,
                file,
              );
              return { specifier: transpile ? transpile(f) : f, name };
            },
          },
        );
      },
    },
  );
  const [copied, inject] = injectRscPayload(pipeable, ssrConfig.input);
  const data = await createFromNodeStream(copied, { moduleMap });
  const { _Slot: Slot, _ServerRoot: ServerRoot, ...elements } = data;
  const readable = renderToPipeableStream(
    createElement(
      ServerRoot,
      { elements: createResolvedPromise(elements) },
      ssrConfig.render({ Slot }),
    ),
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
    .pipe(interleaveHtmlSnippets(...splitHTML(htmlStr)))
    .pipe(inject);
  return [readable, nextCtx];
};
