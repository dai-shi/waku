import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";

import RDServer from "react-dom/server";
import RSDWClient from "react-server-dom-webpack/client.node.unbundled";

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;
const { createFromNodeStream } = RSDWClient;

export const renderHtmlToReadable = (
  htmlStr: string, // Hope stream works, but it'd be too tricky
  rscStream: Readable,
  splitHTML: (htmlStr: string) => readonly [string, string],
  getFallback: (id: string) => string
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
          }
        );
      },
    }
  );
  const passthrough = new PassThrough();
  const [preamble, postamble] = splitHTML(htmlStr);
  passthrough.write(preamble, "utf8");
  const data = createFromNodeStream(rscStream, bundlerConfig);
  const origEnd = passthrough.end;
  passthrough.end = (...args) => {
    passthrough.write(postamble, "utf8");
    return origEnd.apply(passthrough, args as any); // FIXME how to avoid any?
  };
  renderToPipeableStream(data, {
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
  }).pipe(passthrough);
  return passthrough;
};
