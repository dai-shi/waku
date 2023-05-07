import path from "node:path";
import url from "node:url";
import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";
import { randomInt } from "node:crypto";

export type Input<Props extends {} = {}> =
  | {
      rscId: string;
      props: Props;
    }
  | {
      rscId: string;
      props: Props;
      rsfId: string;
      args: unknown[];
    }
  | {
      rsfId: string;
      args: unknown[];
    };

const execArgv = [
  "--conditions",
  "react-server",
  "--experimental-loader",
  "wakuwork/node-loader",
  "--experimental-loader",
  "react-server-dom-webpack/node-loader",
];

const worker = new Worker(
  path.join(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "rsc-renderer-worker.js"
  ),
  { execArgv }
);

export type MessageReq = { id: number; type: "start"; input: Input };

export type MessageRes =
  | { id: number; type: "buf"; buf: ArrayBuffer }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown };

const handlers = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  handlers.get(mesg.id)?.(mesg);
});

export function renderRSC(input: Input): Readable {
  const id = randomInt(Number.MAX_SAFE_INTEGER);
  const passthrough = new PassThrough();
  handlers.set(id, (mesg) => {
    if (mesg.type === "buf") {
      passthrough.write(mesg.buf);
    } else if (mesg.type === "end") {
      passthrough.end();
      handlers.delete(id);
    } else if (mesg.type === "err") {
      passthrough.destroy(
        mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err))
      );
      handlers.delete(id);
    }
  });
  const mesg: MessageReq = { id, type: "start", input };
  worker.postMessage(mesg);
  return passthrough;
}
