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

export type MessageReq =
  | {
      id: number;
      type: "render";
      input: RenderInput;
      loadClientEntries: boolean;
    }
  | {
      id: number;
      type: "prefetcher";
      pathItem: string;
      loadClientEntries: boolean;
    }
  | {
      id: number;
      type: "prerender";
      loadClientEntries: boolean;
    }
  | {
      id: number;
      type: "getCustomModules";
    }
  | {
      id: number;
      type: "build";
    };

export type MessageRes =
  | { id: number; type: "buf"; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: "end" }
  | { id: number; type: "err"; err: unknown }
  | { id: number; type: "prefetcher"; code: string }
  | { id: number; type: "customModules"; modules: string[] };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

worker.on("message", (mesg: MessageRes) => {
  messageCallbacks.get(mesg.id)?.(mesg);
});

let nextId = 1;

export function renderRSC(
  input: RenderInput,
  loadClientEntries: boolean
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
    }
  });
  const mesg: MessageReq = {
    id,
    type: "render",
    input,
    loadClientEntries,
  };
  worker.postMessage(mesg);
  return passthrough;
}

// TODO remove
export function prefetcherRSC(
  pathItem: string,
  loadClientEntries: boolean
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "prefetcher") {
        resolve(mesg.code);
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: "prefetcher",
      pathItem,
      loadClientEntries,
    };
    worker.postMessage(mesg);
  });
}

// TODO remove
export function prerenderRSC(loadClientEntries: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "end") {
        resolve();
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: "prerender",
      loadClientEntries,
    };
    worker.postMessage(mesg);
  });
}

export function getCustomModulesRSC(): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "customModules") {
        resolve(mesg.modules);
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: "getCustomModules",
    };
    worker.postMessage(mesg);
  });
}

export function buildRSC(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const id = nextId++;
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === "end") {
        resolve();
        messageCallbacks.delete(id);
      } else if (mesg.type === "err") {
        reject(mesg.err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: "build",
    };
    worker.postMessage(mesg);
  });
}
