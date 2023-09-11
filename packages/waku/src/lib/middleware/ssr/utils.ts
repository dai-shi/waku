import { Transform } from "node:stream";
import type { Readable } from "node:stream";

import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";

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

export const renderHtmlToReadable = (
  htmlStr: string, // Hope stream works, but it'd be too tricky
  rscStream: Readable,
  splitHTML: (htmlStr: string) => readonly [string, string, string],
  getFallback: (id: string) => string,
): Readable => {
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, nameStr: string) {
              const id = getFallback(filePath + "#" + nameStr);
              const [specifier, name] = id.split("#") as [string, string];
              return { specifier, name };
            },
          },
        );
      },
    },
  );
  const data = createFromNodeStream(rscStream, bundlerConfig);
  return renderToPipeableStream(data, {
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
