import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("rsc-handler-worker.js", import.meta.url), {
  execArgv: ["--conditions", "react-server"],
});

export type RenderInput<Props extends {} = {}> = {
  rscId?: string | undefined;
  props?: Props | undefined;
  rsfId?: string | undefined;
  args?: unknown[] | undefined;
};

type RenderOptions = {
  loadClientEntries?: boolean;
  loadServerEntries?: boolean;
  serverEntryCallback?: (rsfId: string, fileId: string) => void;
};

export type MessageReq = {
  id: number;
  type: "render";
  input: RenderInput;
  loadClientEntries: boolean | undefined;
  loadServerEntries: boolean | undefined;
  notifyServerEntry: boolean;
};

export type MessageRes =
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown }
  | { id: number; type: "serverEntry"; rsfId: string; fileId: string };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  messageCallbacks.get(mesg.id)?.(mesg);
});

let nextId = 1;

export function renderRSC(
  input: RenderInput,
  options?: RenderOptions
): Readable {
  const id = nextId++;
  const passthrough = new PassThrough();
  messageCallbacks.set(id, (mesg) => {
    if (mesg.type === "buf") {
      passthrough.write(Buffer.from(mesg.buf, mesg.offset, mesg.len));
    } else if (mesg.type === "end") {
      passthrough.end();
      messageCallbacks.delete(id);
    } else if (mesg.type === "err") {
      passthrough.destroy(
        mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err))
      );
      messageCallbacks.delete(id);
    } else if (mesg.type === "serverEntry" && options?.serverEntryCallback) {
      options.serverEntryCallback(mesg.rsfId, mesg.fileId);
    }
  });
  const mesg: MessageReq = {
    id,
    type: "render",
    input,
    loadClientEntries: options?.loadClientEntries,
    loadServerEntries: options?.loadServerEntries,
    notifyServerEntry: !!options?.serverEntryCallback,
  };
  worker.postMessage(mesg);
  return passthrough;
}
