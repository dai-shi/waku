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
import type {
  GetEntry,
  Prefetcher,
  Prerenderer,
  GetBuilder,
} from "../../server.js";
import { rscPlugin } from "./vite-rsc-plugin.js";

const { renderToPipeableStream } = RSDWServer;
const CLIENT_REFERENCE = Symbol.for("react.client.reference");

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

const handlePrefetcher = async (mesg: MessageReq & { type: "prefetcher" }) => {
  const { id, pathItem, loadClientEntries } = mesg;
  try {
    const code = await prefetcherRSC(pathItem, loadClientEntries);
    const mesg: MessageRes = {
      id,
      type: "prefetcher",
      code,
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

const handlePrerender = async (mesg: MessageReq & { type: "prerender" }) => {
  const { id, loadClientEntries } = mesg;
  try {
    await prerenderRSC(loadClientEntries);
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
  } else if (mesg.type === "prefetcher") {
    handlePrefetcher(mesg);
  } else if (mesg.type === "prerender") {
    handlePrerender(mesg);
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

async function prefetcherRSC(
  pathItem: string,
  loadClientEntries: boolean
): Promise<string> {
  let code = "";

  const decodeId = await getDecodeId(loadClientEntries);

  const { prefetcher } = await (loadServerFile(entriesFile) as Promise<{
    prefetcher: Prefetcher;
  }>);
  const { entryItems = [], clientModules = [] } = prefetcher
    ? await prefetcher(pathItem)
    : {};
  const moduleIds: string[] = [];
  for (const m of clientModules as any[]) {
    if (m["$$typeof"] !== CLIENT_REFERENCE) {
      throw new Error("clientModules must be client references");
    }
    const [id] = decodeId(m["$$id"]);
    moduleIds.push(id);
  }
  code += generatePrefetchCode(entryItems, moduleIds);
  return code;
}

// TODO this takes too much responsibility
// FIXME it shouldn't depend on `fs`
async function prerenderRSC(loadClientEntries: boolean): Promise<void> {
  const { prerenderer } = await (loadServerFile(entriesFile) as Promise<{
    prerenderer?: Prerenderer;
  }>);

  const decodeId = await getDecodeId(loadClientEntries);

  if (prerenderer) {
    const {
      entryItems = [],
      paths = [],
      unstable_customCode = () => "",
    } = await prerenderer();
    await Promise.all(
      Array.from(entryItems).map(async ([rscId, props]) => {
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
        const pipeable = await renderRSC({ rscId, props: props as any }, true);
        await new Promise<void>((resolve, reject) => {
          const stream = fs.createWriteStream(destFile);
          stream.on("finish", resolve);
          stream.on("error", reject);
          pipeable.pipe(stream);
        });
      })
    );

    const publicIndexHtml = fs.readFileSync(publicIndexHtmlFile, {
      encoding: "utf8",
    });
    for (const pathItem of paths) {
      const code = await prefetcherRSC(pathItem, true);
      const destFile = path.join(
        dir,
        publicPath,
        pathItem,
        pathItem.endsWith("/") ? "index.html" : ""
      );
      let data = "";
      if (fs.existsSync(destFile)) {
        data = fs.readFileSync(destFile, { encoding: "utf8" });
      } else {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        data = publicIndexHtml;
      }
      if (code) {
        // HACK is this too naive to inject script code?
        data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
      }
      const code2 = unstable_customCode(pathItem, decodeId);
      if (code2) {
        data = data.replace(/<\/body>/, `<script>${code2}</script></body>`);
      }
      fs.writeFileSync(destFile, data, { encoding: "utf8" });
    }
  }
}

async function getCustomModulesRSC(): Promise<string[]> {
  const { getBuilder } = await (loadServerFile(entriesFile) as Promise<{
    getBuilder?: GetBuilder;
  }>);
  if (!getBuilder) {
    return [];
  }
  const decodeId = await getDecodeId(true);
  const pathMap = await getBuilder(decodeId);
  return Object.values(pathMap).flatMap((x) =>
    Array.from(x.customModules || [])
  );
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
    Object.entries(pathMap).map(
      async ([pathStr, { elements, unstable_customCode }]) => {
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
            elements || [],
            clientModuleMap.get(pathStr) || []
          ) + unstable_customCode;
        if (code) {
          // HACK is this too naive to inject script code?
          data = data.replace(/<\/body>/, `<script>${code}</script></body>`);
        }
        fs.writeFileSync(destFile, data, { encoding: "utf8" });
      }
    )
  );
}
