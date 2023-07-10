import path from "node:path";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";
import { Server } from "node:http";

import { createServer as viteCreateServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { configFileConfig, resolveConfig } from "../../config.js";
import { hasStatusCode, transformRsfId, deepFreeze } from "./utils.js";
import type { MessageReq, MessageRes } from "./worker-api.js";
import { defineEntries } from "../../../server.js";
import type { RenderInput, RenderOptions } from "../../../server.js";
import { rscTransformPlugin } from "../../vite-plugin/rsc-transform-plugin.js";
import { rscReloadPlugin } from "../../vite-plugin/rsc-reload-plugin.js";

const { renderToPipeableStream } = RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };
type PipeableStream = { pipe<T extends Writable>(destination: T): T };

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, input, command, ctx, moduleIdCallback } = mesg;
  try {
    const options: RenderOptions<never> = { command };
    if (moduleIdCallback) {
      options.moduleIdCallback = (moduleId: string) => {
        const mesg: MessageRes = { id, type: "moduleId", moduleId };
        parentPort!.postMessage(mesg);
      };
    }
    const { runWithContext } = await (loadServerFile("waku/server") as Promise<{
      runWithContext<Context, Result>(ctx: Context, fn: () => Result): Result;
    }>);
    const pipeable = await runWithContext(ctx, () => renderRSC(input, options));
    const mesg: MessageRes = { id, type: "start", ctx };
    parentPort!.postMessage(mesg);
    deepFreeze(ctx);
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
  mesg: MessageReq & { type: "getBuildConfig" }
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

const handleGetSsrConfig = async (
  mesg: MessageReq & { type: "getSsrConfig" }
) => {
  const { id, pathStr, command } = mesg;
  try {
    const output = await getSsrConfigRSC(pathStr, command);
    const mesg: MessageRes = { id, type: "ssrConfig", output };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: "err", err };
    parentPort!.postMessage(mesg);
  }
};

const dummyServer = new Server();

const vitePromise = viteCreateServer({
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
  server: { middlewareMode: true, hmr: { server: dummyServer } },
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
  } else if (mesg.type === "getBuildConfig") {
    handleGetBuildConfig(mesg);
  } else if (mesg.type === "getSsrConfig") {
    handleGetSsrConfig(mesg);
  }
});

const getEntriesFile = async (
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start"
) => {
  return path.join(
    config.root,
    command === "dev" ? config.framework.srcDir : config.framework.distDir,
    config.framework.entriesJs
  );
};

const resolveClientEntry = (
  filePath: string,
  config: Awaited<ReturnType<typeof resolveConfig>>,
  command: "dev" | "build" | "start"
) => {
  const root = path.join(
    config.root,
    command === "dev" ? config.framework.srcDir : config.framework.distDir
  );
  if (command === "dev" && !filePath.startsWith(root)) {
    // HACK this relies on Vite's internal implementation detail.
    return config.base + "@fs" + filePath;
  }
  return config.base + path.relative(root, filePath);
};

async function renderRSC(
  input: RenderInput,
  options: RenderOptions<never>
): Promise<PipeableStream> {
  const config = await resolveConfig(
    options.command === "build" ? "build" : "serve"
  );

  const { unstable_setRootDir } = await (loadServerFile(
    "waku/config"
  ) as Promise<{
    unstable_setRootDir: (root: string) => void;
  }>);
  unstable_setRootDir(config.root);

  const getFunctionComponent = async (rscId: string) => {
    const entriesFile = await getEntriesFile(config, options.command);
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
    const err = new Error("No function component found");
    (err as any).statusCode = 404; // HACK our convention for NotFound
    throw err;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split("#") as [string, string];
        const id = resolveClientEntry(filePath, config, options.command);
        options?.moduleIdCallback?.(id);
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

async function getBuildConfigRSC() {
  const config = await resolveConfig("build");

  const { unstable_setRootDir } = await (loadServerFile(
    "waku/config"
  ) as Promise<{
    unstable_setRootDir: (root: string) => void;
  }>);
  unstable_setRootDir(config.root);

  const entriesFile = await getEntriesFile(config, "build");
  const {
    default: { getBuildConfig },
  } = await (loadServerFile(entriesFile) as Promise<Entries>);
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required."
    );
    return {};
  }

  const output = await getBuildConfig(
    (input: RenderInput, options: Omit<RenderOptions<never>, "command">) =>
      renderRSC(input, { ...options, command: "build" })
  );
  return output;
}

async function getSsrConfigRSC(
  pathStr: string,
  command: "dev" | "build" | "start"
) {
  const config = await resolveConfig(command === "build" ? "build" : "serve");

  const { unstable_setRootDir } = await (loadServerFile(
    "waku/config"
  ) as Promise<{
    unstable_setRootDir: (root: string) => void;
  }>);
  unstable_setRootDir(config.root);

  const entriesFile = await getEntriesFile(config, command);
  const {
    default: { getSsrConfig },
  } = await (loadServerFile(entriesFile) as Promise<Entries>);
  if (!getSsrConfig) {
    return null;
  }
  const output = await getSsrConfig(pathStr);
  return output;
}
