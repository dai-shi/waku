import path from "node:path";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { configFileConfig, resolveConfig } from "../../config.js";
import { transformRsfId } from "./utils.js";
import type { MessageReq, MessageRes } from "./worker-api.js";
import { defineEntries } from "../../../server.js";
import type { RenderInput } from "../../../server.js";
import { rscTransformPlugin } from "../../vite-plugin/rsc-transform-plugin.js";
import { rscReloadPlugin } from "../../vite-plugin/rsc-reload-plugin.js";

const { renderToPipeableStream } = RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };
type PipeableStream = { pipe<T extends Writable>(destination: T): T };

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
    noExternal: /^(?!node:)/,
    // FIXME this is very adhoc.
    external: ["react", "minimatch", "react-server-dom-webpack"],
  },
  resolve: {
    conditions: ["react-server"],
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

const resolveClientEntry = (filePath: string) => {
  if (!resolvedConfig) {
    throw new Error("config is not ready");
  }
  const config = resolvedConfig;
  if (config.command === "build") {
    return (
      config.base +
      path.relative(path.join(config.root, config.build.outDir), filePath)
    );
  }
  if (config.mode === "development" && !filePath.startsWith(config.root)) {
    // HACK this relies on Vite's internal implementation detail.
    return config.base + "@fs" + filePath;
  }
  return config.base + path.relative(config.root, filePath);
};

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
