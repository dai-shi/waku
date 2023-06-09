import path from "node:path";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { configFileConfig, resolveConfig } from "./config.js";
import { transformRsfId } from "./rsc-utils.js";
import type { MessageReq, MessageRes } from "./rsc-handler.js";
import { defineEntries } from "../server.js";
import type { RenderInput } from "../server.js";
import { rscTransformPlugin, rscReloadPlugin } from "./vite-plugin-rsc.js";

const { renderToPipeableStream } = RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };
type PipeableStream = { pipe<T extends Writable>(destination: T): T };

const handleSetClientEntries = async (
  mesg: MessageReq & { type: "setClientEntries" }
) => {
  const { id, value, command } = mesg;
  try {
    await setClientEntries(value, command);
    const mesg: MessageRes = { id, type: "end" };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, input, moduleIdCallback } = mesg;
  try {
    const clientModuleCallback = moduleIdCallback
      ? (moduleId: string) => {
          const mesg: MessageRes = { id, type: "moduleId", moduleId };
          parentPort!.postMessage(mesg);
        }
      : undefined;
    const pipeable = await renderRSC(input, clientModuleCallback);
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
    parentPort!.postMessage(mesg);
  }
};

const handleGetBuilder = async (mesg: MessageReq & { type: "getBuilder" }) => {
  const { id } = mesg;
  try {
    const output = await getBuilderRSC();
    const mesg: MessageRes = { id, type: "builder", output };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const vitePromise = createServer({
  ...configFileConfig,
  plugins: [
    rscTransformPlugin(),
    rscReloadPlugin((type) => {
      const mesg: MessageRes = { type };
      parentPort!.postMessage(mesg);
    }),
  ],
  ssr: {
    // FIXME Without this, "use client" directive in waku/router/client
    // is ignored, and some errors occur.
    // Unless we fix this, RSC-capable packages aren't supported.
    // This also seems to cause problems with pnpm.
    noExternal: ["waku"],
  },
  appType: "custom",
});

const shutdown = async () => {
  const vite = await vitePromise;
  await vite.close();
  parentPort!.close();
};

const loadServerFile = async (fname: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fname);
};

parentPort!.on("message", (mesg: MessageReq) => {
  if (mesg.type === "shutdown") {
    shutdown();
  } else if (mesg.type === "setClientEntries") {
    handleSetClientEntries(mesg);
  } else if (mesg.type === "render") {
    handleRender(mesg);
  } else if (mesg.type === "getBuilder") {
    handleGetBuilder(mesg);
  }
});

// FIXME using mutable module variable doesn't seem nice. Let's revisit this.
let resolvedConfig: Awaited<ReturnType<typeof resolveConfig>> | undefined;

const getEntriesFile = async () => {
  if (!resolvedConfig) {
    throw new Error("config is not ready");
  }
  const config = resolvedConfig;
  if (config.command === "build") {
    return path.join(
      config.root,
      config.build.outDir,
      config.framework.entriesJs
    );
  }
  return path.join(config.root, config.framework.entriesJs);
};

const getFunctionComponent = async (rscId: string) => {
  const entriesFile = await getEntriesFile();
  const {
    default: { getEntry },
  } = await (loadServerFile(entriesFile) as Promise<Entries>);
  const mod = await getEntry(rscId);
  if (typeof mod === "function") {
    return mod;
  }
  if (typeof mod?.default === "function") {
    return mod?.default;
  }
  throw new Error("No function component found");
};

let absoluteClientEntries: Record<string, string> = {};

const resolveClientEntry = (filePath: string) => {
  if (!resolvedConfig) {
    throw new Error("config is not ready");
  }
  const config = resolvedConfig;
  const clientEntry = absoluteClientEntries[filePath];
  if (!clientEntry) {
    if (absoluteClientEntries["*"] === "*") {
      return config.base + path.relative(config.root, filePath);
    }
    throw new Error("No client entry found for " + filePath);
  }
  return clientEntry;
};

async function setClientEntries(
  value: "load" | Record<string, string>,
  command: "serve" | "build"
): Promise<void> {
  if (value !== "load") {
    absoluteClientEntries = value;
    return;
  }
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig(command);
  }
  const config = resolvedConfig;
  const entriesFile = await getEntriesFile();
  const { clientEntries } = await loadServerFile(entriesFile);
  if (!clientEntries) {
    throw new Error("Failed to load clientEntries");
  }
  const baseDir = path.dirname(entriesFile);
  absoluteClientEntries = Object.fromEntries(
    Object.entries(clientEntries).map(([key, val]) => [
      path.join(baseDir, key),
      config.base + val,
    ])
  );
}

async function renderRSC(
  input: RenderInput,
  clientModuleCallback?: (id: string) => void
): Promise<PipeableStream> {
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig("serve");
  }
  const config = resolvedConfig;
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split("#") as [string, string];
        const id = resolveClientEntry(filePath);
        clientModuleCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    }
  );

  if ("rsfId" in input) {
    const [fileId, name] = input.rsfId.split("#");
    const fname = path.join(config.root, fileId!);
    const mod = await loadServerFile(fname);
    const data = await (mod[name!] || mod)(...input.args);
    if (!("rscId" in input)) {
      return renderToPipeableStream(data, bundlerConfig);
    }
    // continue for mutation mode
  }
  if ("rscId" in input) {
    const component = await getFunctionComponent(input.rscId);
    return renderToPipeableStream(
      createElement(component, input.props as any),
      bundlerConfig
    ).pipe(transformRsfId(config.root));
  }
  throw new Error("Unexpected input");
}

async function getBuilderRSC() {
  if (!resolvedConfig) {
    resolvedConfig = await resolveConfig("build");
  }
  const config = resolvedConfig;
  const distEntriesFile = await getEntriesFile();
  const {
    default: { getBuilder },
  } = await (loadServerFile(distEntriesFile) as Promise<Entries>);
  if (!getBuilder) {
    console.warn(
      "getBuilder is undefined. It's recommended for optimization and sometimes required."
    );
    return {};
  }

  const output = await getBuilder(config.root, renderRSC);
  return output;
}
