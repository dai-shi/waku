import path from "node:path";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createServer } from "vite";
import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { transformRsfId, generatePrefetchCode } from "./rsc-utils.js";
import type { RenderInput, MessageReq, MessageRes } from "./rsc-handler.js";
import type { Config } from "../../config.js";
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
    const code = await prefetcherRSC(pathItem, {
      loadClientEntries,
    });
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

parentPort!.on("message", (mesg: MessageReq) => {
  if (mesg.type === "render") {
    handleRender(mesg);
  } else if (mesg.type === "prefetcher") {
    handlePrefetcher(mesg);
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
  const { getEntry } = await loadServerFile(entriesFile);
  const mod = await getEntry(rscId);
  if (typeof mod === "function") {
    return mod;
  }
  if (typeof mod.default === "function") {
    return mod.default;
  }
  throw new Error("No function component found");
};

async function renderRSC(
  input: RenderInput,
  loadClientEntries: boolean
): Promise<PipeableStream> {
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
  options: {
    loadClientEntries: boolean | undefined;
  }
): Promise<string> {
  let code = "";

  // TOOD duplicated code with renderRSC
  let clientEntries: Record<string, string> | undefined;
  if (options.loadClientEntries) {
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

  const { prefetcher } = await loadServerFile(entriesFile);
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
