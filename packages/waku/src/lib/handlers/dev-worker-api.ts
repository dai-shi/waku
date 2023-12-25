import type { Worker as WorkerOrig } from 'node:worker_threads';

import type { ResolvedConfig } from '../config.js';
import type { TransformResult } from 'vite';

export type RenderRequest = {
  input: string;
  searchParamsString: string;
  method: 'GET' | 'POST';
  contentType: string | undefined;
  config: Omit<ResolvedConfig, 'ssr'>;
  context: unknown;
  stream?: ReadableStream;
  moduleIdCallback?: (id: string) => void;
};

export type BuildOutput = {
  rscFiles: string[];
  htmlFiles: string[];
};

export type MessageReq =
  | ({
      id: number;
      type: 'render';
      hasModuleIdCallback: boolean;
    } & Omit<RenderRequest, 'stream' | 'moduleIdCallback'>)
  | { id: number; type: 'buf'; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: 'end' }
  | { id: number; type: 'err'; err: unknown };

export type MessageRes =
  | { type: 'full-reload' }
  | { type: 'hot-import'; source: string }
  | { type: 'module-import'; result: TransformResult }
  | { id: number; type: 'start'; context: unknown }
  | { id: number; type: 'buf'; buf: ArrayBuffer; offset: number; len: number }
  | { id: number; type: 'end' }
  | { id: number; type: 'err'; err: unknown; statusCode?: number }
  | { id: number; type: 'moduleId'; moduleId: string };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

let lastWorker: Promise<WorkerOrig> | undefined;
const getWorker = () => {
  if (lastWorker) {
    return lastWorker;
  }
  return (lastWorker = new Promise<WorkerOrig>((resolve, reject) => {
    Promise.all([
      import('node:worker_threads').catch((e) => {
        throw e;
      }),
      import('node:module').catch((e) => {
        throw e;
      }),
    ])
      .then(([{ Worker }, { default: module }]) => {
        const HAS_MODULE_REGISTER = typeof module.register === 'function';
        const worker = new Worker(
          new URL('dev-worker-impl.js', import.meta.url),
          {
            execArgv: [
              ...(HAS_MODULE_REGISTER
                ? []
                : ['--experimental-loader', 'waku/node-loader']),
              '--conditions',
              'react-server',
            ],
          },
        );
        worker.on('message', (mesg: MessageRes) => {
          if ('id' in mesg) {
            messageCallbacks.get(mesg.id)?.(mesg);
          }
        });
        resolve(worker);
      })
      .catch((e) => reject(e));
  }));
};

export async function registerReloadCallback(
  fn: (type: 'full-reload') => void,
) {
  const worker = await getWorker();
  const listener = (mesg: MessageRes) => {
    if (mesg.type === 'full-reload') {
      fn(mesg.type);
    }
  };
  worker.on('message', listener);
  return () => worker.off('message', listener);
}

export async function registerImportCallback(fn: (source: string) => void) {
  const worker = await getWorker();
  const listener = (mesg: MessageRes) => {
    if (mesg.type === 'hot-import') {
      fn(mesg.source);
    }
  };
  worker.on('message', listener);
  return () => worker.off('message', listener);
}

export async function registerModuleCallback(
  fn: (result: TransformResult) => void,
) {
  const worker = await getWorker();
  const listener = (mesg: MessageRes) => {
    if (mesg.type === 'module-import') {
      fn(mesg.result);
    }
  };
  worker.on('message', listener);
  return () => worker.off('message', listener);
}

let nextId = 1;

export async function renderRscWithWorker<Context>(
  rr: RenderRequest,
): Promise<readonly [ReadableStream, Context]> {
  const worker = await getWorker();
  const id = nextId++;
  const pipe = async () => {
    if (rr.stream) {
      const reader = rr.stream.getReader();
      try {
        let result: ReadableStreamReadResult<unknown>;
        do {
          result = await reader.read();
          if (result.value) {
            const buf = result.value;
            let mesg: MessageReq;
            if (buf instanceof ArrayBuffer) {
              mesg = { id, type: 'buf', buf, offset: 0, len: buf.byteLength };
            } else if (buf instanceof Uint8Array) {
              mesg = {
                id,
                type: 'buf',
                buf: buf.buffer,
                offset: buf.byteOffset,
                len: buf.byteLength,
              };
            } else {
              throw new Error('Unexepected buffer type');
            }
            worker.postMessage(mesg, [mesg.buf]);
          }
        } while (!result.done);
      } catch (err) {
        const mesg: MessageReq = { id, type: 'err', err };
        worker.postMessage(mesg);
      }
    }
    const mesg: MessageReq = { id, type: 'end' };
    worker.postMessage(mesg);
  };
  let started = false;
  return new Promise((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
    });
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === 'start') {
        if (!started) {
          started = true;
          resolve([stream, mesg.context as Context]);
        } else {
          throw new Error('already started');
        }
      } else if (mesg.type === 'buf') {
        if (!started) {
          throw new Error('not yet started');
        }
        controller.enqueue(new Uint8Array(mesg.buf, mesg.offset, mesg.len));
      } else if (mesg.type === 'moduleId') {
        rr.moduleIdCallback?.(mesg.moduleId);
      } else if (mesg.type === 'end') {
        if (!started) {
          throw new Error('not yet started');
        }
        controller.close();
        messageCallbacks.delete(id);
      } else if (mesg.type === 'err') {
        const err =
          mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
        if (mesg.statusCode) {
          (err as any).statusCode = mesg.statusCode;
        }
        if (!started) {
          reject(err);
        } else {
          controller.error(err);
        }
        messageCallbacks.delete(id);
      }
    });
    const { ssr: _removed, ...copiedConfig } = rr.config as any; // HACK type
    const copied = { ...rr, config: copiedConfig };
    delete copied.stream;
    delete copied.moduleIdCallback;
    const mesg: MessageReq = {
      id,
      type: 'render',
      hasModuleIdCallback: !!rr.moduleIdCallback,
      ...copied,
    };
    worker.postMessage(mesg);
    pipe();
  });
}
