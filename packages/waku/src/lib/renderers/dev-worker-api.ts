import type {
  TransferListItem,
  Worker as WorkerType,
} from 'node:worker_threads';

import type { ResolvedConfig } from '../config.js';
import type { HotUpdatePayload } from '../plugins/vite-plugin-rsc-hmr.js';
import type { RenderRscArgs, GetSsrConfigArgs } from './rsc-renderer.js';

export type BuildOutput = {
  rscFiles: string[];
  htmlFiles: string[];
};

export type MessageReq =
  | ({
      id: number;
      type: 'render';
      searchParamsString: string;
      hasModuleIdCallback: boolean;
    } & Omit<RenderRscArgs, 'searchParams' | 'moduleIdCallback' | 'config'> & {
        config: Omit<ResolvedConfig, 'middleware'>;
      })
  | {
      id: number;
      type: 'getSsrConfig';
      config: Omit<ResolvedConfig, 'middleware'>;
      pathname: string;
      searchParamsString: string;
    };

export type MessageRes =
  | { type: 'hot-update'; payload: HotUpdatePayload }
  | {
      id: number;
      type: 'start';
      context: Record<string, unknown> | undefined;
      stream: ReadableStream;
    }
  | { id: number; type: 'err'; err: unknown; statusCode?: number }
  | { id: number; type: 'moduleId'; moduleId: string }
  | {
      id: number;
      type: 'ssrConfig';
      input: string;
      searchParamsString?: string | undefined;
      body: ReadableStream;
    }
  | { id: number; type: 'noSsrConfig' };

const messageCallbacks = new Map<number, (mesg: MessageRes) => void>();

let workerPromise: Promise<WorkerType> | undefined;

export function initializeWorker(config: ResolvedConfig) {
  if (workerPromise) {
    throw new Error('Worker already initialized');
  }
  workerPromise = new Promise<WorkerType>((resolve, reject) => {
    Promise.all([
      import('node:worker_threads').catch((e) => {
        throw e;
      }),
      import('node:module').catch((e) => {
        throw e;
      }),
    ])
      .then(([{ Worker, setEnvironmentData }, { default: module }]) => {
        const HAS_MODULE_REGISTER = typeof module.register === 'function';
        setEnvironmentData(
          '__WAKU_PRIVATE_ENV__',
          (globalThis as any).__WAKU_PRIVATE_ENV__,
        );
        setEnvironmentData('CONFIG_SRC_DIR', config.srcDir);
        setEnvironmentData('CONFIG_ENTRIES_JS', config.entriesJs);
        setEnvironmentData('CONFIG_PRIVATE_DIR', config.privateDir);
        const worker = new Worker(
          new URL('dev-worker-impl.js', import.meta.url),
          {
            execArgv: [
              ...(HAS_MODULE_REGISTER
                ? []
                : ['--experimental-loader', 'waku/node-loader']),
              '--conditions',
              'react-server',
              'workerd',
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
      .catch(reject);
  });
}

const getWorker = () => {
  if (!workerPromise) {
    throw new Error('Worker not initialized');
  }
  return workerPromise;
};

export function registerHotUpdateCallback(
  fn: (payload: HotUpdatePayload) => void,
) {
  getWorker()
    .then((worker) => {
      const listener = (mesg: MessageRes) => {
        if (mesg.type === 'hot-update') {
          fn(mesg.payload);
        }
      };
      worker.on('message', listener);
    })
    .catch((e) => {
      console.error('Failed to register hot update callback', e);
    });
}

let nextId = 1;

export async function renderRscWithWorker(
  args: RenderRscArgs,
): Promise<ReadableStream> {
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
          Object.entries(mesg.context || {}).forEach(([key, value]) => {
            if (args.context) {
              args.context[key] = value;
            }
          });
          resolve(mesg.stream.pipeThrough(bridge));
        } else {
          throw new Error('already started');
        }
      } else if (mesg.type === 'moduleId') {
        args.moduleIdCallback?.(mesg.moduleId);
      } else if (mesg.type === 'err') {
        const err =
          typeof mesg.err === 'string' ? new Error(mesg.err) : mesg.err;
        if (mesg.statusCode) {
          (err as any).statusCode = mesg.statusCode;
        }
        if (!started) {
          reject(err);
        }
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: 'render',
      config: args.config,
      input: args.input,
      searchParamsString: args.searchParams.toString(),
      method: args.method,
      context: args.context,
      body: args.body,
      contentType: args.contentType,
      hasModuleIdCallback: !!args.moduleIdCallback,
    };
    worker.postMessage(
      mesg,
      args.body ? [args.body as unknown as TransferListItem] : undefined,
    );
  });
}

export async function getSsrConfigWithWorker(args: GetSsrConfigArgs): Promise<{
  input: string;
  searchParams?: URLSearchParams;
  body: ReadableStream;
} | null> {
  const worker = await getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    messageCallbacks.set(id, (mesg) => {
      if (mesg.type === 'ssrConfig') {
        resolve({
          input: mesg.input,
          ...(mesg.searchParamsString
            ? { searchParams: new URLSearchParams(mesg.searchParamsString) }
            : {}),
          body: mesg.body,
        });
        messageCallbacks.delete(id);
      } else if (mesg.type === 'noSsrConfig') {
        resolve(null);
        messageCallbacks.delete(id);
      } else if (mesg.type === 'err') {
        const err =
          typeof mesg.err === 'string' ? new Error(mesg.err) : mesg.err;
        if (mesg.statusCode) {
          (err as any).statusCode = mesg.statusCode;
        }
        reject(err);
        messageCallbacks.delete(id);
      }
    });
    const mesg: MessageReq = {
      id,
      type: 'getSsrConfig',
      config: args.config,
      pathname: args.pathname,
      searchParamsString: args.searchParams.toString(),
    };
    worker.postMessage(mesg);
  });
}
