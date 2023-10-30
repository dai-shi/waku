import path from "node:path";
import { Transform } from "node:stream";
import type { Readable } from "node:stream";
import { Server } from "node:http";

import RDServer from "react-dom/server";
import { createServer as viteCreateServer } from "vite";
import type { ViteDevServer } from "vite";

import { configFileConfig, resolveConfig } from "../../config.js";
import { defineEntries } from "../../../server.js";
import { nonjsResolvePlugin } from "../../vite-plugin/nonjs-resolve-plugin.js";

// eslint-disable-next-line import/no-named-as-default-member
const { renderToPipeableStream } = RDServer;

type Entries = { default: ReturnType<typeof defineEntries> };

const dummyServer = new Server();

let lastViteServer:
  | [vite: ViteDevServer, command: "dev" | "build" | "start"]
  | undefined;

const getViteServer = async (command: "dev" | "build" | "start") => {
  if (lastViteServer) {
    if (lastViteServer[1] === command) {
      return lastViteServer[0];
    }
    console.warn("Restarting Vite server with different command");
    await lastViteServer[0].close();
  }
  const viteServer = await viteCreateServer({
    ...configFileConfig(),
    plugins: [...(command === "dev" ? [nonjsResolvePlugin()] : [])],
    appType: "custom",
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  lastViteServer = [viteServer, command];
  return viteServer;
};

export const shutdown = async () => {
  if (lastViteServer) {
    await lastViteServer[0].close();
    lastViteServer = undefined;
  }
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
  const vite = await getViteServer(command);
  const entriesFile = path.join(
    config.root,
    command === "dev" ? config.framework.srcDir : config.framework.distDir,
    config.framework.entriesJs,
  );
  const {
    default: { renderPage },
  } = await (vite.ssrLoadModule(entriesFile) as Promise<Entries>);
  const page = (await renderPage?.(pathStr)) ?? null;
  if (!page) {
    return null;
  }
  const { splitHTML } = config.framework.ssr;
  return renderToPipeableStream(page.element, {
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
