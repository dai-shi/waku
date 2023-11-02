import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { PassThrough, Transform } from "node:stream";
import type { Readable } from "node:stream";
import { Buffer } from "node:buffer";

import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";

import { resolveConfig } from "../../config.js";
import { renderRSC } from "./worker-api.js";
import { hasStatusCode } from "./utils.js";

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

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

const injectRscPayload = (stream: Readable) => {
  const chunks: Buffer[] = [];
  let input: string | undefined;
  let closed = false;
  const copied = new PassThrough();
  stream.on("data", (chunk) => {
    if (input === undefined) {
      const lines = chunk.toString().split("\n");
      for (let i = 0; i < lines.length; ++i) {
        const index = lines[i].indexOf(":") + 1;
        try {
          const obj = JSON.parse(lines[i].slice(index));
          if (typeof obj?._input === "string") {
            input = obj._input;
            lines[i] = lines[i].slice(0, index) + JSON.stringify(obj._ssr);
            break;
          }
        } catch (e) {
          // ignore
        }
      }
      chunks.push(Buffer.from(lines.join("\n")));
    } else {
      chunks.push(chunk);
    }
    copied.write(chunk);
  });
  stream.on("end", () => {
    closed = true;
    copied.end();
  });
  let headSent = false;
  let closedSent = false;
  const inject = new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      const data = chunk.toString();
      if (!headSent) {
        const index = data.indexOf("</head>");
        if (index >= 0) {
          headSent = true;
          callback(
            null,
            data.slice(0, index) +
              `
<script>
globalThis.__WAKU_PREFETCHED__ ||= {};
globalThis.__WAKU_PREFETCHED__["${input}"] = Promise.resolve({
  ok: true,
  body: new ReadableStream({
    start(c) {
      const f = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
      globalThis.__WAKU_PUSH__ = (s) => s ? c.enqueue(f(s)) : c.close();
    }
  })
});
</script>
` +
              data.slice(index),
          );
          return;
        }
      }
      if (headSent && !closedSent) {
        const scripts = chunks.splice(0).map((chunk) =>
          Buffer.from(`
<script>globalThis.__WAKU_PUSH__("${chunk.toString("hex")}")</script>`),
        );
        if (closed) {
          closedSent = true;
          scripts.push(
            Buffer.from(`
<script>globalThis.__WAKU_PUSH__()</script>`),
          );
        }
        callback(null, Buffer.concat([...scripts, chunk]));
        return;
      }
      callback(null, chunk);
    },
    final(callback) {
      if (!closed) {
        throw new Error("RSC stream is not closed yet");
      }
      callback();
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
  let intermediateSent = false;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      if (!preambleSent) {
        preambleSent = true;
        const data = chunk.toString();
        callback(null, preamble + data);
        return;
      }
      if (!intermediateSent) {
        const data = chunk.toString();
        if (data.startsWith("<script>")) {
          intermediateSent = true;
          callback(null, intermediate + data);
          return;
        }
      }
      callback(null, chunk);
    },
    final(callback) {
      if (!preambleSent) {
        this.push(preamble);
      }
      if (!intermediateSent) {
        this.push(intermediate);
      }
      this.push(postamble);
      callback();
    },
  });
};

export const renderHtml = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start",
  pathStr: string,
  htmlStr: string, // Hope stream works, but it'd be too tricky
): Promise<Readable | null> => {
  let pipeable: Readable;
  try {
    [pipeable] = await renderRSC({
      input: pathStr,
      method: "GET",
      headers: {},
      command,
      context: null,
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
              const f = path.join(
                config.rootDir,
                command === "dev" ? config.srcDir : config.distDir,
                filePath,
              );
              return { specifier: transpile ? transpile(f) : f, name };
            },
          },
        );
      },
    },
  );
  const [copied, inject] = injectRscPayload(pipeable);
  const data = await createFromNodeStream(copied, { moduleMap });
  return renderToPipeableStream(data._ssr, {
    onAllReady: () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.clear();
    },
    onError(err) {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.clear();
      console.error(err);
    },
  })
    .pipe(interleaveHtmlSnippets(...splitHTML(htmlStr)))
    .pipe(inject);
};
