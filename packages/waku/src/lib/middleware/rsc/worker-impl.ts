import path from "node:path";
import { parentPort } from "node:worker_threads";
import { PassThrough, Writable } from "node:stream";
import { Server } from "node:http";

import { createServer as viteCreateServer } from "vite";
import type { ViteDevServer } from "vite";
import type { ReactNode } from "react";
import RSDWServer from "react-server-dom-webpack/server";
import busboy from "busboy";

import { configFileConfig, resolveConfig } from "../../config.js";
import { hasStatusCode, transformRsfId, deepFreeze } from "./utils.js";
import type { MessageReq, MessageRes } from "./worker-api.js";
import {
  defineEntries,
  runWithAsyncLocalStorage as runWithAsyncLocalStorageOrig,
} from "../../../server.js";
import type { RenderRequest } from "../../../server.js";
import { rscTransformPlugin } from "../../vite-plugin/rsc-transform-plugin.js";
import { rscReloadPlugin } from "../../vite-plugin/rsc-reload-plugin.js";
import { rscDelegatePlugin } from "../../vite-plugin/rsc-delegate-plugin.js";

const { renderToPipeableStream, decodeReply, decodeReplyFromBusboy } =
  RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };
type PipeableStream = { pipe<T extends Writable>(destination: T): T };

const streamMap = new Map<number, Writable>();

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, pathStr, method, headers, command, context, moduleIdCallback } =
    mesg;
  try {
    const stream = new PassThrough();
    streamMap.set(id, stream);
    const rr: RenderRequest = {
      pathStr,
      method,
      headers,
      command,
      stream,
      context,
    };
    if (moduleIdCallback) {
      rr.moduleIdCallback = (moduleId: string) => {
        const mesg: MessageRes = { id, type: "moduleId", moduleId };
        parentPort!.postMessage(mesg);
      };
    }
    const pipeable = await renderRSC(rr);
    const mesg: MessageRes = { id, type: "start", context };
    parentPort!.postMessage(mesg);
    deepFreeze(context);
    const writable = new Writable({
      write(chunk, encoding, callback) {
        if (encoding !== ("buffer" as any)) {
          throw new Error("Unknown encoding");
        }
        const buffer: Buffer = chunk;
        const mesg: MessageRes = {
          id,
          type: "buf",
          buf: buffer.buffer,
          offset: buffer.byteOffset,
          len: buffer.length,
        };
        parentPort!.postMessage(mesg, [mesg.buf]);
        callback();
      },
      final(callback) {
        const mesg: MessageRes = { id, type: "end" };
        parentPort!.postMessage(mesg);
        callback();
      },
    });
    pipeable.pipe(writable);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    if (hasStatusCode(err)) {
      mesg.statusCode = err.statusCode;
    }
    parentPort!.postMessage(mesg);
  }
};

const handleGetBuildConfig = async (
  mesg: MessageReq & { type: "getBuildConfig" },
) => {
  const { id } = mesg;
  try {
    const output = await getBuildConfigRSC();
    const mesg: MessageRes = { id, type: "buildConfig", output };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const handleGetSsrInput = async (
  mesg: MessageReq & { type: "getSsrInput" },
) => {
  const { id, pathStr, command } = mesg;
  try {
    const input = await getSsrInputRSC(pathStr, command);
    const mesg: MessageRes = { id, type: "ssrInput", input };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

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
    plugins: [
      rscTransformPlugin(),
      rscReloadPlugin((type) => {
        const mesg: MessageRes = { type };
        parentPort!.postMessage(mesg);
      }),
      rscDelegatePlugin((source) => {
        const mesg: MessageRes = { type: "hot-import", source };
        parentPort!.postMessage(mesg);
      }),
    ],
    resolve: {
      conditions: ["react-server"],
    },
    appType: "custom",
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  lastViteServer = [viteServer, command];
  return viteServer;
};

const shutdown = async () => {
  if (lastViteServer) {
    await lastViteServer[0].close();
    lastViteServer = undefined;
  }
  parentPort!.close();
};

const loadServerFile = async (
  fname: string,
  command: "dev" | "build" | "start",
) => {
  const vite = await getViteServer(command);
  return vite.ssrLoadModule(fname);
};

parentPort!.on("message", (mesg: MessageReq) => {
  if (mesg.type === "shutdown") {
    shutdown();
  } else if (mesg.type === "render") {
    handleRender(mesg);
  } else if (mesg.type === "getBuildConfig") {
    handleGetBuildConfig(mesg);
  } else if (mesg.type === "getSsrInput") {
    handleGetSsrInput(mesg);
  } else if (mesg.type === "buf") {
    const stream = streamMap.get(mesg.id)!;
    stream.write(Buffer.from(mesg.buf, mesg.offset, mesg.len));
  } else if (mesg.type === "end") {
    const stream = streamMap.get(mesg.id)!;
    stream.end();
  } else if (mesg.type === "err") {
    const stream = streamMap.get(mesg.id)!;
    const err =
      mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
    stream.destroy(err);
  }
});

const getEntriesFile = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start",
) => {
  return path.join(
    config.root,
    command === "dev" ? config.framework.srcDir : config.framework.distDir,
    config.framework.entriesJs,
  );
};

const resolveClientEntry = (
  filePath: string,
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start",
) => {
  if (filePath.startsWith("file://")) {
    filePath = filePath.slice(7);
  }
  let root = path.join(
    config.root,
    command === "dev" ? config.framework.srcDir : config.framework.distDir,
  );
  if (path.sep !== "/") {
    // HACK to support windows filesystem
    root = root.replaceAll(path.sep, "/");
  }
  if (command === "dev" && !filePath.startsWith(root)) {
    // HACK this relies on Vite's internal implementation detail.
    return config.base + "@fs/" + filePath.replace(/^\//, "");
  }
  return config.base + path.relative(root, filePath);
};

async function renderRSC(rr: RenderRequest): Promise<PipeableStream> {
  const config = await resolveConfig(
    rr.command === "build" ? "build" : "serve",
  );

  const { runWithAsyncLocalStorage } = await (loadServerFile(
    "waku/server",
    rr.command,
  ) as Promise<{
    runWithAsyncLocalStorage: typeof runWithAsyncLocalStorageOrig;
  }>);

  const entriesFile = await getEntriesFile(config, rr.command);
  const {
    default: { renderEntries, getSsrConfig },
  } = await (loadServerFile(entriesFile, rr.command) as Promise<Entries>);
  const ssrConfig = getSsrConfig?.();
  const ssrFilter: NonNullable<typeof ssrConfig>["filter"] = (elements) => {
    if (!ssrConfig) {
      throw new Error("getSsrConfig is required");
    }
    return ssrConfig.filter(elements);
  };

  const render = async (input: string) => {
    const elements = await renderEntries(input);
    if (elements === null) {
      const err = new Error("No function component found");
      (err as any).statusCode = 404; // HACK our convention for NotFound
      throw err;
    }
    if (Object.keys(elements).some((key) => key.startsWith("_"))) {
      throw new Error('"_" prefix is reserved');
    }
    return elements;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split("#") as [string, string];
        const id = resolveClientEntry(filePath, config, rr.command);
        rr?.moduleIdCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );

  if (rr.method === "POST") {
    const actionId = decodeURIComponent(rr.pathStr);
    let args: unknown[] = [];
    const contentType = rr.headers["content-type"];
    if (
      typeof contentType === "string" &&
      contentType.startsWith("multipart/form-data")
    ) {
      const bb = busboy({ headers: rr.headers });
      const reply = decodeReplyFromBusboy(bb);
      rr.stream.pipe(bb);
      args = await reply;
    } else {
      let body = "";
      for await (const chunk of rr.stream) {
        body += chunk;
      }
      if (body) {
        args = await decodeReply(body);
      }
    }
    const [fileId, name] = actionId.split("#");
    const fname = path.join(config.root, fileId!);
    const mod = await loadServerFile(fname, rr.command);
    let elements: Promise<Record<string, ReactNode>> = Promise.resolve({});
    const rerender = (input: string) => {
      elements = Promise.all([elements, render(input)]).then(
        ([oldElements, newElements]) => ({ ...oldElements, ...newElements }),
      );
    };
    return runWithAsyncLocalStorage(
      {
        getContext: () => rr.context,
        rerender,
      },
      async () => {
        const data = await (mod[name!] || mod)(...args);
        return renderToPipeableStream(
          { ...(await elements), _value: data },
          bundlerConfig,
        ).pipe(transformRsfId(config.root));
      },
    );
  }

  const input = rr.pathStr === "__DEFAULT__" ? "" : rr.pathStr;
  const ssr = rr.headers["x-waku-ssr-mode"] === "rsc";
  return runWithAsyncLocalStorage(
    {
      getContext: () => rr.context,
      rerender: () => {
        throw new Error("Cannot rerender");
      },
    },
    async () => {
      const elements = await render(input);
      return renderToPipeableStream(
        ssr ? ssrFilter(elements) : elements,
        bundlerConfig,
      ).pipe(transformRsfId(config.root));
    },
  );
}

async function getBuildConfigRSC() {
  const config = await resolveConfig("build");

  const entriesFile = await getEntriesFile(config, "build");
  const {
    default: { getBuildConfig },
  } = await (loadServerFile(entriesFile, "build") as Promise<Entries>);
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required.",
    );
    return {};
  }

  const unstable_collectClientModules = async (
    input: string,
  ): Promise<string[]> => {
    const idSet = new Set<string>();
    const stream = new PassThrough();
    stream.end();
    const pipeable = await renderRSC({
      pathStr: input || "__DEFAULT__",
      method: "GET",
      headers: {},
      command: "build",
      stream,
      context: null,
      moduleIdCallback: (id) => idSet.add(id),
    });
    await new Promise<void>((resolve, reject) => {
      const stream = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
      stream.on("finish", resolve);
      stream.on("error", reject);
      pipeable.pipe(stream);
    });
    return Array.from(idSet);
  };

  const output = await getBuildConfig(unstable_collectClientModules);
  return output;
}

async function getSsrInputRSC(
  pathStr: string,
  command: "dev" | "build" | "start",
) {
  const config = await resolveConfig(command === "build" ? "build" : "serve");

  const entriesFile = await getEntriesFile(config, command);
  const {
    default: { getSsrConfig },
  } = await (loadServerFile(entriesFile, command) as Promise<Entries>);
  if (!getSsrConfig) {
    return null;
  }
  const output = await getSsrConfig().getInput(pathStr);
  return output;
}
