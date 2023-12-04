import path from 'node:path'; // TODO no node dependency
import url from 'node:url'; // TODO no node dependency
import { parentPort } from 'node:worker_threads'; // TODO no node dependency

import type { ReactNode } from 'react';
import type { ViteDevServer } from 'vite';

import type { ResolvedConfig } from '../../../config.js';
import { viteInlineConfig } from '../../config.js';
import { normalizePath } from '../../utils/path.js';
import { hasStatusCode, deepFreeze, parseFormData } from './utils.js';
import type { MessageReq, MessageRes, RenderRequest } from './worker-api.js';
import {
  defineEntries,
  runWithAsyncLocalStorage as runWithAsyncLocalStorageOrig,
} from '../../../server.js';

let nodeLoaderRegistered = false;
const loadRSDWServer = async (
  config: Omit<ResolvedConfig, 'ssr'>,
  command: 'dev' | 'build' | 'start',
) => {
  if (command !== 'dev') {
    return (
      await import(
        url
          .pathToFileURL(
            path.join(config.rootDir, config.distDir, 'rsdw-server.js'),
          )
          .toString()
      )
    ).default;
  }
  if (!nodeLoaderRegistered) {
    nodeLoaderRegistered = true;
    const IS_NODE_20 = Number(process.versions.node.split('.')[0]) >= 20;
    if (IS_NODE_20) {
      const {
        default: { register },
      } = await import('node:module');
      register('waku/node-loader', url.pathToFileURL('./'));
    }
  }
  return import('react-server-dom-webpack/server.edge');
};

type Entries = {
  default: ReturnType<typeof defineEntries>;
};
const controllerMap = new Map<number, ReadableStreamDefaultController>();

const handleRender = async (mesg: MessageReq & { type: 'render' }) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, type, hasModuleIdCallback, ...rest } = mesg;
  const rr: RenderRequest = rest;
  try {
    const stream = new ReadableStream({
      start(controller) {
        controllerMap.set(id, controller);
      },
    });
    rr.stream = stream;
    if (hasModuleIdCallback) {
      rr.moduleIdCallback = (moduleId: string) => {
        const mesg: MessageRes = { id, type: 'moduleId', moduleId };
        parentPort!.postMessage(mesg);
      };
    }
    const readable = await renderRSC(rr);
    const mesg: MessageRes = { id, type: 'start', context: rr.context };
    parentPort!.postMessage(mesg);
    deepFreeze(rr.context);
    const writable = new WritableStream({
      write(chunk) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        const mesg: MessageRes = {
          id,
          type: 'buf',
          buf: chunk.buffer,
          offset: chunk.byteOffset,
          len: chunk.byteLength,
        };
        parentPort!.postMessage(mesg, [mesg.buf]);
      },
      close() {
        const mesg: MessageRes = { id, type: 'end' };
        parentPort!.postMessage(mesg);
      },
    });
    readable.pipeTo(writable);
  } catch (err) {
    const mesg: MessageRes = { id, type: 'err', err };
    if (hasStatusCode(err)) {
      mesg.statusCode = err.statusCode;
    }
    parentPort!.postMessage(mesg);
  }
};

const handleGetBuildConfig = async (
  mesg: MessageReq & { type: 'getBuildConfig' },
) => {
  const { id, config } = mesg;
  try {
    const output = await getBuildConfigRSC(config);
    const mesg: MessageRes = { id, type: 'buildConfig', output };
    parentPort!.postMessage(mesg);
  } catch (err) {
    const mesg: MessageRes = { id, type: 'err', err };
    parentPort!.postMessage(mesg);
  }
};

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const { Server } = await import('node:http');
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: viteCreateServer } = await import('vite');
  const { rscTransformPlugin } = await import(
    '../../vite-plugin/rsc-transform-plugin.js'
  );
  const { rscReloadPlugin } = await import(
    '../../vite-plugin/rsc-reload-plugin.js'
  );
  const { rscDelegatePlugin } = await import(
    '../../vite-plugin/rsc-delegate-plugin.js'
  );
  const viteServer = await viteCreateServer({
    ...(await viteInlineConfig()),
    plugins: [
      rscTransformPlugin(false),
      rscReloadPlugin((type) => {
        const mesg: MessageRes = { type };
        parentPort!.postMessage(mesg);
      }),
      rscDelegatePlugin((source) => {
        const mesg: MessageRes = { type: 'hot-import', source };
        parentPort!.postMessage(mesg);
      }),
    ],
    ssr: {
      resolve: {
        conditions: ['react-server', 'workerd'],
        externalConditions: ['react-server', 'workerd'],
      },
      external: ['react', 'react-server-dom-webpack', 'waku'],
      noExternal: /^(?!node:)/,
    },
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  await viteServer.ws.close();
  lastViteServer = viteServer;
  return viteServer;
};

const shutdown = async () => {
  if (lastViteServer) {
    await lastViteServer.close();
    lastViteServer = undefined;
  }
  parentPort!.close();
};

const loadServerFile = async (
  fname: string,
  command: 'dev' | 'build' | 'start',
) => {
  if (command !== 'dev') {
    return import(fname);
  }
  const vite = await getViteServer();
  return vite.ssrLoadModule(fname);
};

parentPort!.on('message', (mesg: MessageReq) => {
  if (mesg.type === 'shutdown') {
    shutdown();
  } else if (mesg.type === 'render') {
    handleRender(mesg);
  } else if (mesg.type === 'getBuildConfig') {
    handleGetBuildConfig(mesg);
  } else if (mesg.type === 'buf') {
    const controller = controllerMap.get(mesg.id)!;
    controller.enqueue(new Uint8Array(mesg.buf, mesg.offset, mesg.len));
  } else if (mesg.type === 'end') {
    const controller = controllerMap.get(mesg.id)!;
    controller.close();
  } else if (mesg.type === 'err') {
    const controller = controllerMap.get(mesg.id)!;
    const err =
      mesg.err instanceof Error ? mesg.err : new Error(String(mesg.err));
    controller.error(err);
  }
});

const getEntriesFile = (
  config: Omit<ResolvedConfig, 'ssr'>,
  command: 'dev' | 'build' | 'start',
) => {
  const filePath = path.join(
    config.rootDir,
    command === 'dev' ? config.srcDir : config.distDir,
    config.entriesJs,
  );
  return normalizePath(
    command === 'dev' ? filePath : url.pathToFileURL(filePath).toString(),
  );
};

const resolveClientEntry = (
  filePath: string,
  config: Omit<ResolvedConfig, 'ssr'>,
  command: 'dev' | 'build' | 'start',
) => {
  filePath = filePath.startsWith('file:///')
    ? url.fileURLToPath(filePath)
    : filePath;
  const root = path.join(
    config.rootDir,
    command === 'dev' ? config.srcDir : config.distDir,
  );
  if (!filePath.startsWith(root)) {
    if (command === 'dev') {
      // HACK this relies on Vite's internal implementation detail.
      return normalizePath(
        config.basePath + '@fs/' + filePath.replace(/^\//, ''),
      );
    } else {
      throw new Error(
        'Resolving client module outside root is unsupported for now',
      );
    }
  }
  return normalizePath(config.basePath + path.relative(root, filePath));
};

// HACK Patching stream is very fragile.
const transformRsfId = (prefixToRemove: string) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let data = '';
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      data += decoder.decode(chunk);
      if (!data.endsWith('\n')) {
        return;
      }
      const lines = data.split('\n');
      data = '';
      for (let i = 0; i < lines.length; ++i) {
        const match = lines[i]!.match(
          new RegExp(
            `^([0-9]+):{"id":"(?:file:///?)?${prefixToRemove}(.*?)"(.*)$`,
          ),
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${match[2]}"${match[3]}`;
        }
      }
      controller.enqueue(encoder.encode(lines.join('\n')));
    },
  });
};

async function renderRSC(rr: RenderRequest): Promise<ReadableStream> {
  const config = rr.config;
  const { renderToReadableStream, decodeReply } = await loadRSDWServer(
    config,
    rr.command,
  );

  const { runWithAsyncLocalStorage } = await (loadServerFile(
    'waku/server',
    rr.command,
  ) as Promise<{
    runWithAsyncLocalStorage: typeof runWithAsyncLocalStorageOrig;
  }>);

  const entriesFile = getEntriesFile(config, rr.command);
  const {
    default: { renderEntries },
  } = await (loadServerFile(entriesFile, rr.command) as Promise<Entries>);

  const rsfPrefix =
    path.posix.join(
      config.rootDir,
      rr.command === 'dev' ? config.srcDir : config.distDir,
    ) + '/';

  const render = async (input: string) => {
    const elements = await renderEntries(input);
    if (elements === null) {
      const err = new Error('No function component found');
      (err as any).statusCode = 404; // HACK our convention for NotFound
      throw err;
    }
    if (Object.keys(elements).some((key) => key.startsWith('_'))) {
      throw new Error('"_" prefix is reserved');
    }
    return elements;
  };

  const bundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [filePath, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(filePath, config, rr.command);
        rr?.moduleIdCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );

  if (rr.method === 'POST') {
    const rsfId = decodeURIComponent(rr.input);
    let args: unknown[] = [];
    const contentType = rr.headers['content-type'];
    let body = '';
    if (rr.stream) {
      const decoder = new TextDecoder();
      const reader = rr.stream.getReader();
      let result: ReadableStreamReadResult<unknown>;
      do {
        result = await reader.read();
        if (result.value) {
          if (!(result.value instanceof Uint8Array)) {
            throw new Error('Unexepected buffer type');
          }
          body += decoder.decode(result.value);
        }
      } while (!result.done);
    }
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // XXX This doesn't support streaming unlike busboy
      const formData = parseFormData(body, contentType);
      args = await decodeReply(formData);
    } else if (body) {
      args = await decodeReply(body);
    }
    const [fileId, name] = rsfId.split('#') as [string, string];
    const filePath = fileId.startsWith('/') ? fileId : rsfPrefix + fileId;
    const fname =
      rr.command === 'dev' ? filePath : url.pathToFileURL(filePath).toString();
    const mod = await loadServerFile(fname, rr.command);
    let elements: Promise<Record<string, ReactNode>> = Promise.resolve({});
    const rerender = (input: string) => {
      elements = Promise.all([elements, render(input)]).then(
        ([oldElements, newElements]) => ({ ...oldElements, ...newElements }),
      );
    };
    return runWithAsyncLocalStorage(
      {
        getContext: () => rr.context,
        rerender,
      },
      async () => {
        const data = await (mod[name] || mod)(...args);
        return renderToReadableStream(
          { ...(await elements), _value: data },
          bundlerConfig,
        ).pipeThrough(transformRsfId(rsfPrefix));
      },
    );
  }

  return runWithAsyncLocalStorage(
    {
      getContext: () => rr.context,
      rerender: () => {
        throw new Error('Cannot rerender');
      },
    },
    async () => {
      const elements = await render(rr.input);
      return renderToReadableStream(elements, bundlerConfig).pipeThrough(
        transformRsfId(rsfPrefix),
      );
    },
  );
}

async function getBuildConfigRSC(config: Omit<ResolvedConfig, 'ssr'>) {
  const entriesFile = getEntriesFile(config, 'build');
  const {
    default: { getBuildConfig },
  } = await (loadServerFile(entriesFile, 'build') as Promise<Entries>);
  if (!getBuildConfig) {
    console.warn(
      "getBuildConfig is undefined. It's recommended for optimization and sometimes required.",
    );
    return {};
  }

  const unstable_collectClientModules = async (
    input: string,
  ): Promise<string[]> => {
    const idSet = new Set<string>();
    const readable = await renderRSC({
      input,
      method: 'GET',
      headers: {},
      config,
      command: 'build',
      context: null,
      moduleIdCallback: (id) => idSet.add(id),
    });
    await new Promise<void>((resolve, reject) => {
      const writable = new WritableStream({
        close() {
          resolve();
        },
        abort(reason) {
          reject(reason);
        },
      });
      readable.pipeTo(writable);
    });
    return Array.from(idSet);
  };

  const output = await getBuildConfig(unstable_collectClientModules);
  return output;
}
