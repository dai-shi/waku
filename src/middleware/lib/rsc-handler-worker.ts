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
import type { GetEntry, GetBuilder, GetCustomModules } from "../../server.js";
import { rscPlugin } from "./vite-rsc-plugin.js";

const { renderToPipeableStream } = RSDWServer;

const handleRender = async (mesg: MessageReq & { type: "render" }) => {
  const { id, input, loadClientEntries } = mesg;
  try {
    const pipeable = await renderRSC(input, loadClientEntries);
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
  if (mesg.type === "render") {
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
const dirFromConfig = {
  dev: config.devServer?.dir,
  build: config.build?.dir,
  start: config.prdServer?.dir,
}[String(process.env.WAKUWORK_CMD)];
const dir = path.resolve(dirFromConfig || ".");
const basePath = config.build?.basePath || "/"; // FIXME it's not build only
const distPath = config.files?.dist || "dist";
const publicPath = path.join(distPath, config.files?.public || "public");
const publicIndexHtmlFile = path.join(
  dir,
  publicPath,
  config.files?.indexHtml || "index.html"
);
const srcEntriesFile = path.join(dir, config.files?.entriesJs || "entries.js");
const entriesFile = path.join(
  dir,
  process.env.WAKUWORK_CMD === "build" ? distPath : "",
  config.files?.entriesJs || "entries.js"
);

const vitePromise = createServer({
  root: dir,
  plugins: [rscPlugin()],
  appType: "custom",
});

const loadServerFile = async (fname: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fname);
};

const getFunctionComponent = async (rscId: string) => {
  const { getEntry } = await (loadServerFile(entriesFile) as Promise<{
    getEntry: GetEntry;
  }>);
  const mod = await getEntry(rscId);
  if (typeof mod === "function") {
    return mod;
  }
  if (typeof mod.default === "function") {
    return mod.default;
  }
  throw new Error("No function component found");
};

// FIXME better function name? decodeId seems too general
const getDecodeId = async (loadClientEntries: boolean) => {
  let clientEntries: Record<string, string> | undefined;
  if (loadClientEntries) {
    ({ clientEntries } = await loadServerFile(entriesFile));
    if (!clientEntries) {
      throw new Error("Failed to load clientEntries");
    }
  }

  const getClientEntry = (id: string) => {
    if (!clientEntries) {
      return id;
    }
    const clientEntry =
      clientEntries[id] ||
      clientEntries[id.replace(/\.js$/, ".ts")] ||
      clientEntries[id.replace(/\.js$/, ".tsx")] ||
      clientEntries[id.replace(/\.js$/, ".jsx")];
    if (!clientEntry) {
      throw new Error("No client entry found");
    }
    return clientEntry;
  };

  const decodeId = (encodedId: string): [id: string, name: string] => {
    let [id, name] = encodedId.split("#") as [string, string];
    if (!id.startsWith("wakuwork/")) {
      id = path.relative(
        path.join(dir, process.env.WAKUWORK_CMD === "build" ? distPath : ""),
        id
      );
      id = basePath + getClientEntry(id);
    }
    return [id, name];
  };

  return decodeId;
};

async function renderRSC(
  input: RenderInput,
  loadClientEntries: boolean
): Promise<PipeableStream> {
  const decodeId = await getDecodeId(loadClientEntries);

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [id, name] = decodeId(encodedId);
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
    const component = await getFunctionComponent(input.rscId);
    return renderToPipeableStream(
      createElement(component, input.props),
      bundlerConfig
    ).pipe(
      transformRsfId(
        path.join(dir, process.env.WAKUWORK_CMD === "build" ? distPath : "")
      )
    );
  }
  throw new Error("Unexpected input");
}

async function getCustomModulesRSC(): Promise<{ [name: string]: string }> {
  const { getCustomModules } = await (loadServerFile(
    srcEntriesFile
  ) as Promise<{
    getCustomModules?: GetCustomModules;
  }>);
  if (!getCustomModules) {
    return {};
  }
  const modules = await getCustomModules();
  return modules;
}

// FIXME this may take too much responsibility
async function buildRSC(): Promise<void> {
  const { getBuilder } = await (loadServerFile(entriesFile) as Promise<{
    getBuilder?: GetBuilder;
  }>);
  if (!getBuilder) {
    console.warn(
      "getBuilder is undefined. It's recommended for optimization and sometimes required."
    );
    return;
  }

  const decodeId = await getDecodeId(true);

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
    Object.entries(pathMap).map(([pathStr, { elements }]) =>
      Promise.all(
        Array.from(elements || []).map(async ([rscId, props]) => {
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
          const component = await getFunctionComponent(rscId);
          const pipeable = renderToPipeableStream(
            createElement(component, props as any),
            bundlerConfig
          ).pipe(
            transformRsfId(
              path.join(
                dir,
                process.env.WAKUWORK_CMD === "build" ? distPath : ""
              )
            )
          );
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createWriteStream(destFile);
            stream.on("finish", resolve);
            stream.on("error", reject);
            pipeable.pipe(stream);
          });
        })
      )
    )
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
