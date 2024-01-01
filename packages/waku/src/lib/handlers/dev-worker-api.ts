import type {
  TransferListItem,
  Worker as WorkerType,
} from 'node:worker_threads';

import type { ResolvedConfig } from '../config.js';
import type { ModuleImportResult } from './types.js';

export type RenderRequest = {
  input: string;
  searchParamsString: string;
  method: 'GET' | 'POST';
  contentType: string | undefined;
  config: ResolvedConfig;
  context: unknown;
  stream?: ReadableStream;
  moduleIdCallback?: (id: string) => void;
};

export type BuildOutput = {
  rscFiles: string[];
  htmlFiles: string[];
};

export type MessageReq = {
  id: number;
  type: 'render';
  hasModuleIdCallback: boolean;
} & Omit<RenderRequest, 'moduleIdCallback'>;

export type MessageRes =
  | { type: 'full-reload' }
  | { type: 'hot-import'; source: string }
  | { type: 'module-import'; result: ModuleImportResult }
  | { id: number; type: 'start'; context: unknown; stream: ReadableStream }
  | { id: number; type: 'err'; err: unknown; statusCode?: number }
  | { id: number; type: 'moduleId'; moduleId: string };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

let lastWorker: Promise<WorkerType> | undefined;
const getWorker = () => {
  if (lastWorker) {
    return lastWorker;
  }
  return (lastWorker = new Promise<WorkerType>((resolve, reject) => {
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
            env: {
              __WAKU_PRIVATE_ENV__: JSON.stringify(
                (globalThis as any).__WAKU_PRIVATE_ENV__,
              ),
            },
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
  fn: (result: ModuleImportResult) => void,
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
  let started = false;
  return new Promise((resolve, reject) => {
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === 'start') {
        if (!started) {
          started = true;
          const bridge = new TransformStream({
            flush() {
              messageCallbacks.delete(id);
            },
          });
          resolve([mesg.stream.pipeThrough(bridge), mesg.context as Context]);
        } else {
          throw new Error('already started');
        }
      } else if (mesg.type === 'moduleId') {
        rr.moduleIdCallback?.(mesg.moduleId);
      } else if (mesg.type === 'err') {
        const err =
          mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
        if (mesg.statusCode) {
          (err as any).statusCode = mesg.statusCode;
        }
        if (!started) {
          reject(err);
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
      ...(rr.stream ? { stream: rr.stream } : {}),
      ...copied,
    };
    worker.postMessage(
      mesg,
      rr.stream ? [rr.stream as unknown as TransferListItem] : undefined,
    );
  });
}
