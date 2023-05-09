import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

export type Input<Props extends {} = {}> = {
  rscId?: string | undefined;
  props?: Props | undefined;
  rsfId?: string | undefined;
  args?: unknown[] | undefined;
};

type Options = {
  loadClientEntries?: boolean;
  loadServerEntries?: boolean;
  serverEntryCallback?: (rsfId: string, fileId: string) => void;
};

const execArgv = [
  "--conditions",
  "react-server",
  // TODO the use of process.env is temporary
  ...(process.env.WAKUWORK_CMD === "dev"
    ? ["--experimental-loader", "tsx"]
    : []),
  "--experimental-loader",
  "wakuwork/node-loader",
  "--experimental-loader",
  "react-server-dom-webpack/node-loader",
];

const worker = new Worker(new URL("rsc-renderer-worker.js", import.meta.url), {
  execArgv,
});

export type MessageReq = {
  id: number;
  type: "start";
  input: Input;
  loadClientEntries: boolean | undefined;
  loadServerEntries: boolean | undefined;
  notifyServerEntry: boolean;
};

export type MessageRes =
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown }
  | { id: number; type: "serverEntry"; rsfId: string; fileId: string };

const handlers = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  handlers.get(mesg.id)?.(mesg);
});

let nextId = 1;

export function renderRSC(input: Input, options?: Options): Readable {
  const id = nextId++;
  const passthrough = new PassThrough();
  handlers.set(id, (mesg) => {
    if (mesg.type === "buf") {
      passthrough.write(Buffer.from(mesg.buf, mesg.offset, mesg.len));
    } else if (mesg.type === "end") {
      passthrough.end();
      handlers.delete(id);
    } else if (mesg.type === "err") {
      passthrough.destroy(
        mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err))
      );
      handlers.delete(id);
    } else if (mesg.type === "serverEntry" && options?.serverEntryCallback) {
      options.serverEntryCallback(mesg.rsfId, mesg.fileId);
    }
  });
  const mesg: MessageReq = {
    id,
    type: "start",
    input,
    loadClientEntries: options?.loadClientEntries,
    loadServerEntries: options?.loadServerEntries,
    notifyServerEntry: !!options?.serverEntryCallback
  };
  worker.postMessage(mesg);
  return passthrough;
}
