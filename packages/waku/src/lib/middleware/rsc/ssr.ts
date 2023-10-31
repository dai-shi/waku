import path from "node:path";
import { Transform } from "node:stream";
import type { Readable } from "node:stream";

import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";

import { resolveConfig } from "../../config.js";
import { renderRSC } from "./worker-api.js";

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

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
  // TODO return null if not found
  const [pipeable] = await renderRSC({
    input: pathStr,
    method: "GET",
    headers: {},
    command,
    context: null,
    ssr: true,
  });
  const { splitHTML } = config.ssr;
  const moduleMap = new Proxy(
    {},
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              const specifier = path.join(
                config.rootDir,
                command === "dev" ? config.srcDir : config.distDir,
                filePath,
              );
              return { specifier, name };
            },
          },
        );
      },
    },
  );
  const data = await createFromNodeStream(pipeable, { moduleMap });
  return renderToPipeableStream(data._ssr, {
    onError(err) {
      if (
        err instanceof Error &&
        err.message.startsWith("Client-only component")
      ) {
        // ignore
        return;
      }
      console.error(err);
    },
  }).pipe(interleaveHtmlSnippets(...splitHTML(htmlStr)));
};
