import url from 'node:url'; // TODO no node dependency
import { parentPort } from 'node:worker_threads'; // TODO no node dependency

import type { ViteDevServer } from 'vite';

import { viteInlineConfig } from '../../config.js';
import { hasStatusCode, deepFreeze } from './utils.js';
import type { MessageReq, MessageRes, RenderRequest } from './worker-api.js';
import { renderRSC, getBuildConfigRSC } from '../../rsc/renderer.js';

let nodeLoaderRegistered = false;
const registerNodeLoader = async () => {
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
};

const controllerMap = new Map<number, ReadableStreamDefaultController>();

const handleRender = async (mesg: MessageReq & { type: 'render' }) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, type, hasModuleIdCallback, ...rest } = mesg;
  const rr: RenderRequest = rest;
  if (rr.command === 'dev') {
    await registerNodeLoader();
  }
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
    const readable = await renderRSC({
      config: rr.config,
      input: rr.input,
      method: rr.method,
      context: rr.context,
      body: rr.stream,
      contentType: rr.headers['content-type'] as string,
      ...(rr.moduleIdCallback ? { moduleIdCallback: rr.moduleIdCallback } : {}),
      ...(rr.command === 'dev'
        ? {
            isDev: true,
            customImport: loadServerFile,
          }
        : {
            isDev: false,
          }),
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

const handleGetBuildConfig = async (
  mesg: MessageReq & { type: 'getBuildConfig' },
) => {
  const { id, config } = mesg;
  try {
    const output = await getBuildConfigRSC({ config });
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

const loadServerFile = async (fname: string) => {
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
