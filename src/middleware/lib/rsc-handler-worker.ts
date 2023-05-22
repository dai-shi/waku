import path from "node:path";
import fs from "node:fs";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { transformRsfId, generatePrefetchCode } from "./rsc-utils.js";
import type { RenderInput, MessageReq, MessageRes } from "./rsc-handler.js";
import type { Config } from "../../config.js";
import { defineEntries } from "../../server.js";
import type { unstable_GetCustomModules } from "../../server.js";
import { rscTransformPlugin, rscReloadPlugin } from "./vite-plugin-rsc.js";

const { renderToPipeableStream } = RSDWServer;

type Entries = { default: ReturnType<typeof defineEntries> };

const handleSetClientEntries = async (
  mesg: MessageReq & { type: "setClientEntries" }
) => {
  const { id, value } = mesg;
  try {
    await setClientEntries(value);
    const mesg: MessageRes = {
      id,
      type: "end",
    };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = {
      id,
      type: "err",
      err,
    };
    parentPort!.postMessage(mesg);
  }
};

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, input } = mesg;
  try {
    const pipeable = await renderRSC(input);
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
        const mesg: MessageRes = {
          id,
          type: "end",
        };
        parentPort!.postMessage(mesg);
        callback();
      },
    });
    pipeable.pipe(writable);
  } catch (err) {
    const mesg: MessageRes = {
      id,
      type: "err",
      err,
    };
    parentPort!.postMessage(mesg);
  }
};

const handleGetCustomModules = async (
  mesg: MessageReq & { type: "getCustomModules" }
) => {
  const { id } = mesg;
  try {
    const modules = await getCustomModulesRSC();
    const mesg: MessageRes = {
      id,
      type: "customModules",
      modules,
    };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = {
      id,
      type: "err",
      err,
    };
    parentPort!.postMessage(mesg);
  }
};

const handleBuild = async (mesg: MessageReq & { type: "build" }) => {
  const { id } = mesg;
  try {
    await buildRSC();
    const mesg: MessageRes = {
      id,
      type: "end",
    };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = {
      id,
      type: "err",
      err,
    };
    parentPort!.postMessage(mesg);
  }
};

parentPort!.on("message", (mesg: MessageReq) => {
  if (mesg.type === "shutdown") {
    vitePromise.then(async (vite) => {
      await vite.close();
      parentPort!.close();
    });
  } else if (mesg.type === "setClientEntries") {
    handleSetClientEntries(mesg);
  } else if (mesg.type === "render") {
    handleRender(mesg);
  } else if (mesg.type === "getCustomModules") {
    handleGetCustomModules(mesg);
  } else if (mesg.type === "build") {
    handleBuild(mesg);
  }
});

type PipeableStream = {
  pipe<T extends Writable>(destination: T): T;
};

// TODO use of process.env is all temporary
// TODO these are temporary
const config: Config =
  (process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG)) ||
  {};
const dirFromConfig =
  config.prdServer?.dir ?? config.build?.dir ?? config.devServer?.dir; // HACK
const dir = path.resolve(dirFromConfig || ".");
const basePath = config.build?.basePath || "/"; // FIXME it's not build only
const distPath = config.files?.dist || "dist";
const publicPath = path.join(distPath, config.files?.public || "public");
const publicIndexHtmlFile = path.join(
  dir,
  publicPath,
  config.files?.indexHtml || "index.html"
);
const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
const distEntriesFile = path.join(
  dir,
  distPath,
  config.files?.entriesJs || "entries.js"
);

const vitePromise = createServer({
  root: dir,
  ...(process.env.NODE_ENV && { mode: process.env.NODE_ENV }),
  plugins: [
    rscTransformPlugin(),
    ...(process.env.NODE_ENV === "development"
      ? [
          rscReloadPlugin((type) => {
            const mesg: MessageRes = { type };
            parentPort!.postMessage(mesg);
          }),
        ]
      : []),
  ],
  ssr: {
    noExternal: ["wakuwork"], // FIXME this doesn't seem ideal?
  },
  appType: "custom",
});

const loadServerFile = async (fname: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fname);
};

const getFunctionComponent = async (rscId: string, isBuild: boolean) => {
  const {
    default: { getEntry },
  } = await (loadServerFile(
    isBuild ? distEntriesFile : entriesFile
  ) as Promise<Entries>);
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
  const clientEntry = absoluteClientEntries[filePath];
  if (!clientEntry) {
    if (absoluteClientEntries["*"] === "*") {
      return basePath + path.relative(dir, filePath);
    }
    throw new Error("No client entry found for " + filePath);
  }
  return clientEntry;
};

async function setClientEntries(
  value: "load" | Record<string, string>
): Promise<void> {
  if (value !== "load") {
    absoluteClientEntries = value;
    return;
  }
  const { clientEntries } = await loadServerFile(entriesFile);
  if (!clientEntries) {
    throw new Error("Failed to load clientEntries");
  }
  const baseDir = path.dirname(entriesFile);
  absoluteClientEntries = Object.fromEntries(
    Object.entries(clientEntries).map(([key, val]) => [
      path.join(baseDir, key),
      basePath + val,
    ])
  );
}

async function renderRSC(input: RenderInput): Promise<PipeableStream> {
  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split("#") as [string, string];
        const id = resolveClientEntry(filePath);
        return { id, chunks: [id], name, async: true };
      },
    }
  );

  if (input.rsfId && input.args) {
    const [fileId, name] = input.rsfId.split("#");
    const fname = path.join(dir, fileId!);
    const mod = await loadServerFile(fname);
    const data = await (mod[name!] || mod)(...input.args);
    if (!input.rscId) {
      return renderToPipeableStream(data, bundlerConfig);
    }
    // continue for mutation mode
  }
  if (input.rscId && input.props) {
    const component = await getFunctionComponent(input.rscId, false);
    return renderToPipeableStream(
      createElement(component, input.props),
      bundlerConfig
    ).pipe(transformRsfId(dir));
  }
  throw new Error("Unexpected input");
}

async function getCustomModulesRSC(): Promise<{ [name: string]: string }> {
  const {
    default: { unstable_getCustomModules: getCustomModules },
  } = await (loadServerFile(entriesFile) as Promise<{
    default: Entries["default"] & {
      unstable_getCustomModules?: unstable_GetCustomModules;
    };
  }>);
  if (!getCustomModules) {
    return {};
  }
  const modules = await getCustomModules();
  return modules;
}

// FIXME this may take too much responsibility
async function buildRSC(): Promise<void> {
  const {
    default: { getBuilder },
  } = await (loadServerFile(distEntriesFile) as Promise<Entries>);
  if (!getBuilder) {
    console.warn(
      "getBuilder is undefined. It's recommended for optimization and sometimes required."
    );
    return;
  }

  // FIXME this doesn't seem an ideal solution
  const decodeId = (encodedId: string): [id: string, name: string] => {
    const [filePath, name] = encodedId.split("#") as [string, string];
    const id = resolveClientEntry(filePath);
    return [id, name];
  };

  const pathMap = await getBuilder(decodeId);
  const clientModuleMap = new Map<string, Set<string>>();
  const addClientModule = (pathStr: string, id: string) => {
    let idSet = clientModuleMap.get(pathStr);
    if (!idSet) {
      idSet = new Set();
      clientModuleMap.set(pathStr, idSet);
    }
    idSet.add(id);
  };
  await Promise.all(
    Object.entries(pathMap).map(async ([pathStr, { elements }]) => {
      for (const [rscId, props] of elements || []) {
        // FIXME we blindly expect JSON.stringify usage is deterministic
        const serializedProps = JSON.stringify(props);
        const searchParams = new URLSearchParams();
        searchParams.set("props", serializedProps);
        const destFile = path.join(
          dir,
          publicPath,
          "RSC",
          decodeURIComponent(rscId),
          decodeURIComponent(`${searchParams}`)
        );
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        const bundlerConfig = new Proxy(
          {},
          {
            get(_target, encodedId: string) {
              const [id, name] = decodeId(encodedId);
              addClientModule(pathStr, id);
              return { id, chunks: [id], name, async: true };
            },
          }
        );
        const component = await getFunctionComponent(rscId, true);
        const pipeable = renderToPipeableStream(
          createElement(component, props as any),
          bundlerConfig
        ).pipe(transformRsfId(path.join(dir, distPath)));
        await new Promise<void>((resolve, reject) => {
          const stream = fs.createWriteStream(destFile);
          stream.on("finish", resolve);
          stream.on("error", reject);
          pipeable.pipe(stream);
        });
      }
    })
  );

  const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
    encoding: "utf8",
  });
  await Promise.all(
    Object.entries(pathMap).map(async ([pathStr, { elements, customCode }]) => {
      const destFile = path.join(
        dir,
        publicPath,
        pathStr,
        pathStr.endsWith("/") ? "index.html" : ""
      );
      let data = "";
      if (fs.existsSync(destFile)) {
        data = fs.readFileSync(destFile, { encoding: "utf8" });
      } else {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        data = publicIndexHtml;
      }
      const code =
        generatePrefetchCode(
          Array.from(elements || []).flatMap(([rscId, props, skipPrefetch]) => {
            if (skipPrefetch) {
              return [];
            }
            return [[rscId, props]];
          }),
          clientModuleMap.get(pathStr) || []
        ) + (customCode || "");
      if (code) {
        // HACK is this too naive to inject script code?
        data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
      }
      fs.writeFileSync(destFile, data, { encoding: "utf8" });
    })
  );
}
