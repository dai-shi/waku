import path from "node:path";
import url from "node:url";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import { transformRsfId } from "./rsc-utils.js";
import type { Input, MessageReq, MessageRes } from "./rsc-renderer.js";
import type { Config } from "../../config.js";

const { renderToPipeableStream } = RSDWServer;

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
const entriesFile = url
  .pathToFileURL(
    path.join(
      dir,
      process.env.WAKUWORK_CMD === "build" ? distPath : "",
      config.files?.entriesJs || "entries.js"
    )
  )
  .toString();

const getFunctionComponent = async (rscId: string) => {
  const { getEntry } = await import(entriesFile);
  const mod = await getEntry(rscId);
  if (typeof mod === "function") {
    return mod;
  }
  if (typeof mod.default === "function") {
    return mod.default;
  }
  throw new Error("No function component found");
};

parentPort!.on("message", async (mesg: MessageReq) => {
  const { id, input, loadClientEntries, loadServerEntries, notifyServerEntry } =
    mesg;
  try {
    const pipeable = await renderRSC(input, {
      loadClientEntries,
      loadServerEntries,
      serverEntryCallback: notifyServerEntry
        ? (rsfId, fileId) => {
            const mesg: MessageRes = {
              id,
              type: "serverEntry",
              rsfId,
              fileId,
            };
            parentPort!.postMessage(mesg);
          }
        : undefined,
    });
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
});

async function renderRSC(
  input: Input,
  options: {
    loadClientEntries: boolean | undefined;
    loadServerEntries: boolean | undefined;
    serverEntryCallback: ((rsfId: string, fileId: string) => void) | undefined;
  }
): Promise<PipeableStream> {
  let clientEntries: Record<string, string> | undefined;
  let serverEntries: Record<string, string> | undefined;
  if (options.loadClientEntries) {
    ({ clientEntries } = await import(entriesFile));
    if (!clientEntries) {
      throw new Error("Failed to load clientEntries");
    }
  }
  if (options.loadServerEntries) {
    ({ serverEntries } = await import(entriesFile));
    if (!serverEntries) {
      throw new Error("Failed to load serverEntries");
    }
  } else if (process.env.WAKUWORK_CMD !== "dev") {
    serverEntries = {};
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
        "file://" +
          encodeURI(
            path.join(dir, process.env.WAKUWORK_CMD === "build" ? distPath : "")
          ),
        id
      );
      id = basePath + getClientEntry(decodeURI(id));
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

  const registerServerEntry = (fileId: string): string => {
    if (!serverEntries) {
      return fileId;
    }
    for (const entry of Object.entries(serverEntries)) {
      if (entry[1] === fileId) {
        return entry[0];
      }
    }
    const rsfId = `rsf${Object.keys(serverEntries).length}`;
    serverEntries[rsfId] = fileId;
    options.serverEntryCallback?.(rsfId, fileId);
    return rsfId;
  };

  const getServerEntry = (rsfId: string): string => {
    if (!serverEntries) {
      return rsfId;
    }
    const fileId = serverEntries[rsfId];
    if (!fileId) {
      throw new Error("No server entry found");
    }
    return fileId;
  };

  if (input.rsfId && input.args) {
    const [fileId, name] = getServerEntry(input.rsfId).split("#");
    const fname = path.join(dir, fileId!);
    const mod = await import(fname);
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
        "file://" +
          encodeURI(
            path.join(dir, process.env.WAKUWORK_CMD === "build" ? distPath : "")
          ),
        registerServerEntry
      )
    );
  }
  throw new Error("Unexpected input");
}
