// This file can depend on Node.js

import url from 'node:url';
import { parentPort } from 'node:worker_threads';
import { Server } from 'node:http';
import { createServer as viteCreateServer } from 'vite';
import type { ViteDevServer } from 'vite';

import { fileURLToFilePath } from '../utils/path.js';
import { hasStatusCode, deepFreeze } from './utils.js';
import type { MessageReq, MessageRes, RenderRequest } from './worker-api.js';
import { renderRsc } from './rsc-renderer.js';
import { rscTransformPlugin } from '../plugins/vite-plugin-rsc-transform.js';
import { rscReloadPlugin } from '../plugins/vite-plugin-rsc-reload.js';
import { rscDelegatePlugin } from '../plugins/vite-plugin-rsc-delegate.js';

const IS_NODE_20 = Number(process.versions.node.split('.')[0]) >= 20;
if (IS_NODE_20) {
  const {
    default: { register },
  } = await import('node:module');
  register('waku/node-loader', url.pathToFileURL('./'));
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

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const viteServer = await viteCreateServer({
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

const loadServerFile = async (fileURL: string) => {
  const vite = await getViteServer();
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
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
