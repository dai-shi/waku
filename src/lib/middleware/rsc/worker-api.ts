import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

import type { RenderInput, GetBuildConfig } from "../../../server.js";

const worker = new Worker(new URL("worker-impl.js", import.meta.url), {
  execArgv: ["--conditions", "react-server"],
});

export type BuildOutput = {
  rscFiles: string[];
  htmlFiles: string[];
};

export type MessageReq =
  | { type: "shutdown" }
  | {
      id: number;
      type: "render";
      input: RenderInput;
      moduleIdCallback: boolean;
    }
  | { id: number; type: "getBuildConfig" };

export type MessageRes =
  | { type: "full-reload" }
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "moduleId"; moduleId: string }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown; statusCode?: number }
  | {
      id: number;
      type: "builder";
      output: Awaited<ReturnType<GetBuildConfig>>;
    };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  if ("id" in mesg) {
    messageCallbacks.get(mesg.id)?.(mesg);
  }
});

export function registerReloadCallback(fn: (type: "full-reload") => void) {
  const listener = (mesg: MessageRes) => {
    if (mesg.type === "full-reload") {
      fn(mesg.type);
    }
  };
  worker.on("message", listener);
  return () => worker.off("message", listener);
}

export function shutdown(): Promise<void> {
  return new Promise((resolve) => {
    worker.on("close", resolve);
    const mesg: MessageReq = { type: "shutdown" };
    worker.postMessage(mesg);
  });
}

let nextId = 1;

export function renderRSC(
  input: RenderInput,
  clientModuleCallback?: (id: string) => void
): Readable {
  const id = nextId++;
  const passthrough = new PassThrough();
  messageCallbacks.set(id, (mesg) => {
    if (mesg.type === "buf") {
      passthrough.write(Buffer.from(mesg.buf, mesg.offset, mesg.len));
    } else if (mesg.type === "moduleId") {
      clientModuleCallback?.(mesg.moduleId);
    } else if (mesg.type === "end") {
      passthrough.end();
      messageCallbacks.delete(id);
    } else if (mesg.type === "err") {
      const err =
        mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
      if (mesg.statusCode) {
        (err as any).statusCode = mesg.statusCode;
      }
      passthrough.destroy(err);
      messageCallbacks.delete(id);
    }
  });
  const mesg: MessageReq = {
    id,
    type: "render",
    input,
    moduleIdCallback: !!clientModuleCallback,
  };
  worker.postMessage(mesg);
  return passthrough;
}

export function getBuildConfigRSC(): ReturnType<GetBuildConfig> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "builder") {
        resolve(mesg.output);
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = { id, type: "getBuildConfig" };
    worker.postMessage(mesg);
  });
}
