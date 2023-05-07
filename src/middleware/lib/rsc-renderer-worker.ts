import path from "node:path";
import { parentPort } from "node:worker_threads";
import { Writable } from "node:stream";

import { createElement } from "react";
import RSDWServer from "react-server-dom-webpack/server";

import type { Input, MessageReq, MessageRes } from "./rsc-renderer.js";

const { renderToPipeableStream } = RSDWServer;

type PipeableStream = {
  pipe<T extends Writable>(destination: T): T;
};

// TODO this is temporary
const config =
  (process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG)) ||
  {};

// TODO this is dev only
const dir = path.resolve(config.devServer?.dir || ".");
const entriesFile = path.join(dir, config.files?.entriesJs || "entries.js");

const getFunctionComponent = async (rscId: string) => {
  const { getEntry } = await import(entriesFile);
  return getEntry(rscId);
};

// TODO this is dev only
const decodeId = (encodedId: string): [id: string, name: string] => {
  let [id, name] = encodedId.split("#") as [string, string];
  if (!id.startsWith("wakuwork/")) {
    id = path.relative("file://" + encodeURI(dir), id);
    id = "/" + decodeURI(id);
  }
  return [id, name];
};

// TODO this is dev only
const bundlerConfig = new Proxy(
  {},
  {
    get(_target, encodedId: string) {
      const [id, name] = decodeId(encodedId);
      return { id, chunks: [id], name, async: true };
    },
  }
);

if (!parentPort) {
  throw new Error("Not in worker!");
}

parentPort.on("message", async (mesg: MessageReq) => {
  const { id, input } = mesg;
  try {
    const pipeable = await renderRSC(input);
    const writable = new Writable({
      write(chunk, encoding, callback) {
        if (encoding !== ("buffer" as any)) {
          throw new Error("Unknown encoding");
        }
        const mesg: MessageRes = {
          id,
          type: "buf",
          buf: chunk,
        };
        parentPort!.postMessage(mesg, [chunk]);
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

async function renderRSC(input: Input): Promise<PipeableStream> {
  if ("rsfId" in input) {
    const [filePath, name] = input.rsfId.split("#");
    const fname = path.join(dir, filePath!);
    const mod = await import(fname);
    const data = await (mod[name!] || mod)(...input.args);
    if (!("rscId" in input)) {
      return renderToPipeableStream(data, bundlerConfig);
    }
    // continue for mutation mode
  }
  const component = await getFunctionComponent(input.rscId);
  return renderToPipeableStream(createElement(component, input.props));
}
