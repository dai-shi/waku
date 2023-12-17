// This file can depend on Node.js

import url from 'node:url';
import { parentPort } from 'node:worker_threads';
import { Server } from 'node:http';
import { createServer as createViteServer } from 'vite';

import type { EntriesDev } from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { joinPath, fileURLToFilePath } from '../utils/path.js';
import { hasStatusCode, deepFreeze } from '../renderers/utils.js';
import type { MessageReq, MessageRes, RenderRequest } from './worker-api.js';
import { renderRsc } from '../renderers/rsc-renderer.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscReloadPlugin } from '../plugins/vite-plugin-rsc-reload.js';
import { rscDelegatePlugin } from '../plugins/vite-plugin-rsc-delegate.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';

const { default: module } = await import('node:module');
const HAS_MODULE_REGISTER = typeof module.register === 'function';
if (HAS_MODULE_REGISTER) {
  module.register('waku/node-loader', url.pathToFileURL('./'));
}
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
    const readable = await renderRsc({
      config: rr.config,
      input: rr.input,
      method: rr.method,
      context: rr.context,
      body: rr.stream,
      contentType: rr.contentType,
      ...(rr.moduleIdCallback ? { moduleIdCallback: rr.moduleIdCallback } : {}),
      isDev: true,
      customImport: loadServerFile,
      entries: await loadEntries(rr.config),
    });
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

const dummyServer = new Server(); // FIXME we hope to avoid this hack

const mergedViteConfig = await mergeUserViteConfig({
  plugins: [
    nonjsResolvePlugin(),
    rscTransformPlugin(false),
    rscReloadPlugin((type) => {
      const mesg: MessageRes = { type };
      parentPort!.postMessage(mesg);
    }),
    rscDelegatePlugin((resultOrSource) => {
      const mesg: MessageRes =
        typeof resultOrSource === 'object'
          ? { type: 'module-import', result: resultOrSource }
          : { type: 'hot-import', source: resultOrSource };
      parentPort!.postMessage(mesg);
    }),
  ],
  ssr: {
    resolve: {
      conditions: ['react-server', 'workerd'],
      externalConditions: ['react-server', 'workerd'],
    },
    external: ['react', 'react-server-dom-webpack'],
    noExternal: /^(?!node:)/,
  },
  appType: 'custom',
  server: { middlewareMode: true, hmr: { server: dummyServer } },
});

const vitePromise = createViteServer(mergedViteConfig).then(async (vite) => {
  await vite.ws.close();
  return vite;
});

const loadServerFile = async (fileURL: string) => {
  const vite = await vitePromise;
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
};

const loadEntries = async (config: Omit<ResolvedConfig, 'ssr'>) => {
  const vite = await vitePromise;
  const filePath = joinPath(vite.config.root, config.srcDir, config.entriesJs);
  return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
};

parentPort!.on('message', (mesg: MessageReq) => {
  if (mesg.type === 'render') {
    handleRender(mesg);
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
