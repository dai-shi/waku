import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc/server';
import { buildMetadata } from 'virtual:vite-rsc-waku/build-metadata';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import notFoundHtml from 'virtual:vite-rsc-waku/not-found';
import { BUILD_METADATA_FILE, DIST_PUBLIC, DIST_SERVER } from '../constants.js';
import { setAllEnv } from '../env.js';
import type {
  Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter,
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_ProcessBuild as ProcessBuild,
  Unstable_ProcessRequest as ProcessRequest,
} from '../types.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { sanitizeLog } from '../utils/log.js';
import { addBase, joinPath } from '../utils/path.js';
import { DEBUG_ID_HEADER } from '../utils/react-debug-channel.js';
import { createRenderUtils } from '../utils/render.js';
import { getInput } from '../utils/request.js';
import { encodeRscPath } from '../utils/rsc-path.js';
import { stringToStream } from '../utils/stream.js';

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<
    typeof import('../vite-entries/entry.ssr.js')
  >('ssr', 'index');
}

const toProcessRequest =
  (handleRequest: HandleRequest): ProcessRequest =>
  async (req) => {
    const temporaryReferences = createTemporaryReferenceSet();

    const input = await getInput(
      req,
      config,
      temporaryReferences,
      decodeReply,
      decodeAction,
      decodeFormState,
      loadServerAction,
    );

    const debugId =
      (import.meta.env.DEV && req.headers.get(DEBUG_ID_HEADER.toLowerCase())) ||
      undefined;
    const debugChannels = globalThis.__WAKU_DEBUG_CHANNELS__;
    const debugChannel = debugId ? debugChannels?.get(debugId) : undefined;
    if (debugId) {
      debugChannels?.delete(debugId);
    }

    const renderUtils = createRenderUtils(
      temporaryReferences,
      renderToReadableStream,
      loadSsrEntryModule,
      import.meta.env.WAKU_BUILD_ID ?? '',
      debugChannel,
      debugId,
    );

    let res: Awaited<ReturnType<typeof handleRequest>>;
    try {
      res = await handleRequest(input, {
        ...renderUtils,
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      });
    } catch (e) {
      const info = getErrorInfo(e);
      const status = info?.status || 500;
      let message: string;
      if (info) {
        message = (e as { message?: string } | undefined)?.message || String(e);
      } else {
        console.warn(sanitizeLog(e));
        message = 'Internal Server Error';
      }
      const body = stringToStream(message);
      const headers: { location?: string } = {};
      if (info?.location) {
        headers.location = addBase(info.location, config.basePath);
      }
      return new Response(body, { status, headers });
    }

    if (res instanceof ReadableStream) {
      return new Response(res);
    } else if (res && res !== 'fallback') {
      return res;
    }

    // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
    const url = new URL(req.url);
    if (res === 'fallback' || (!res && url.pathname === '/')) {
      const { INTERNAL_renderHtmlFallback } = await loadSsrEntryModule();
      const htmlFallbackStream = await INTERNAL_renderHtmlFallback();
      const headers = { 'content-type': 'text/html; charset=utf-8' };
      return new Response(htmlFallbackStream, { headers });
    }

    return null;
  };

const toProcessBuild =
  (handleBuild: HandleBuild): ProcessBuild =>
  async ({ emitFile, unstable_registerPrunableFile }) => {
    const renderUtils = createRenderUtils(
      undefined,
      renderToReadableStream,
      loadSsrEntryModule,
      import.meta.env.WAKU_BUILD_ID ?? '',
    );

    let fallbackHtml: string | undefined;
    const getFallbackHtml = async () => {
      if (!fallbackHtml) {
        const ssrEntryModule = await loadSsrEntryModule();
        fallbackHtml = await ssrEntryModule.INTERNAL_renderHtmlFallback();
      }
      return fallbackHtml;
    };

    const getPublicFilePath = (fileName: string) => {
      const filePath = joinPath(DIST_PUBLIC, fileName);
      if (!filePath.startsWith(DIST_PUBLIC + '/')) {
        throw new Error('fileName escapes the public directory: ' + fileName);
      }
      return filePath;
    };

    await handleBuild({
      renderRsc: renderUtils.renderRsc,
      renderHtml: renderUtils.renderHtml,
      rscPath2pathname: (rscPath) =>
        joinPath(config.rscBase, encodeRscPath(rscPath)),
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: async (fileName, body) => {
        await emitFile(
          getPublicFilePath(fileName),
          typeof body === 'string' ? stringToStream(body) : body,
        );
      },
      generateDefaultHtml: async (fileName) => {
        await emitFile(
          getPublicFilePath(fileName),
          stringToStream(await getFallbackHtml()),
        );
      },
      unstable_registerPrunableFile,
    });
    await emitFile(
      joinPath(DIST_SERVER, BUILD_METADATA_FILE),
      stringToStream(
        `export const buildMetadata = new Map(${JSON.stringify(
          Array.from(buildMetadata),
        )});`,
      ),
    );
  };

export const createServerEntryAdapter: CreateServerEntryAdapter =
  (fn) => (handlers, options) => {
    const processRequest = toProcessRequest(handlers.handleRequest);
    const processBuild = toProcessBuild(handlers.handleBuild);
    return fn(
      {
        handlers,
        processRequest,
        processBuild,
        setAllEnv,
        config,
        isBuild,
        notFoundHtml,
      },
      options,
    );
  };
