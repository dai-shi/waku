import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import type { Readable } from "node:stream";

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
  let readable: Readable;
  try {
    const [pipeable] = await renderRSC({
      input: pathStr,
      method: "GET",
      headers: {},
      command,
      context: null,
      ssr: true,
    });
    readable = pipeable;
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
  const data = await createFromNodeStream(readable, { moduleMap });
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
  }).pipe(interleaveHtmlSnippets(...splitHTML(htmlStr)));
};
