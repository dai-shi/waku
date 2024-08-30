import { createElement } from 'react';
import type { ReactNode, FunctionComponent, ComponentProps } from 'react';
import type * as RDServerType from 'react-dom/server.edge';
import type { default as RSDWClientType } from 'react-server-dom-webpack/client.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';

import type * as WakuClientType from '../../client.js';
import type { EntriesPrd } from '../../server.js';
import type { ResolvedConfig } from '../config.js';
import { concatUint8Arrays } from '../utils/stream.js';
import {
  joinPath,
  filePathToFileURL,
  fileURLToFilePath,
  encodeFilePathToAbsolute,
} from '../utils/path.js';
import { encodeInput, hasStatusCode } from './utils.js';

// HACK depending on these constants is not ideal
import { SRC_MAIN } from '../plugins/vite-plugin-rsc-managed.js';
import { DEFAULT_HTML_HEAD } from '../plugins/vite-plugin-rsc-index.js';

export const CLIENT_MODULE_MAP = {
  'rd-server': 'react-dom/server.edge',
  'rsdw-client': 'react-server-dom-webpack/client.edge',
  'waku-client': 'waku/client',
} as const;
export const CLIENT_PREFIX = 'client/';

const fakeFetchCode = `
Promise.resolve(new Response(new ReadableStream({
  start(c) {
    const d = (self.__FLIGHT_DATA ||= []);
    const t = new TextEncoder();
    const f = (s) => c.enqueue(typeof s === 'string' ? t.encode(s) : s);
    d.forEach(f);
    d.push = f;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => c.close());
    } else {
      c.close();
    }
  }
})))
`
  .split('\n')
  .map((line) => line.trim())
  .join('');

const CLOSING_HEAD = '</head>';
const CLOSING_BODY = '</body>';

const injectHtmlHead = (
  urlForFakeFetch: string,
  htmlHead: string,
  mainJsPath: string, // for DEV only, pass `''` for PRD
) => {
  const modifyHeadAndBody = (data: string) => {
    const closingHeadIndex = data.indexOf(CLOSING_HEAD);
    let [head, body] =
      closingHeadIndex === -1
        ? ['<head>' + CLOSING_HEAD, data]
        : [
            data.slice(0, closingHeadIndex + CLOSING_HEAD.length),
            data.slice(closingHeadIndex + CLOSING_HEAD.length),
          ];
    head =
      head.slice(0, -CLOSING_HEAD.length) +
      DEFAULT_HTML_HEAD +
      htmlHead +
      CLOSING_HEAD;
    const matchPrefetched = head.match(
      // HACK This is very brittle
      /(.*<script[^>]*>\nglobalThis\.__WAKU_PREFETCHED__ = {\n)(.*?)(\n};.*)/s,
    );
    if (matchPrefetched) {
      head =
        matchPrefetched[1] +
        `  '${urlForFakeFetch}': ${fakeFetchCode},` +
        matchPrefetched[3];
    }
    let code = `
globalThis.__WAKU_HYDRATE__ = true;
`;
    if (!matchPrefetched) {
      code += `
globalThis.__WAKU_PREFETCHED__ = {
  '${urlForFakeFetch}': ${fakeFetchCode},
};
`;
    }
    if (code) {
      head =
        head.slice(0, -CLOSING_HEAD.length) +
        `<script type="module" async>${code}</script>` +
        CLOSING_HEAD;
    }
    if (mainJsPath) {
      const closingBodyIndex = body.indexOf(CLOSING_BODY);
      const [firstPart, secondPart] =
        closingBodyIndex === -1
          ? [body, '']
          : [body.slice(0, closingBodyIndex), body.slice(closingBodyIndex)];
      body =
        firstPart +
        `<script src="${mainJsPath}" async type="module"></script>` +
        secondPart;
    }
    return head + body;
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let headSent = false;
  let data = '';
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      data += decoder.decode(chunk);
      if (!headSent) {
        if (!/<body[^>]*>/.test(data)) {
          return;
        }
        headSent = true;
        data = modifyHeadAndBody(data);
      }
      controller.enqueue(encoder.encode(data));
      data = '';
    },
    flush(controller) {
      if (!headSent) {
        headSent = true;
        data = modifyHeadAndBody(data);
        controller.enqueue(encoder.encode(data));
        data = '';
      }
    },
  });
};

// HACK for now, do we want to use HTML parser?
const rectifyHtml = () => {
  const pending: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      pending.push(chunk);
      if (/<\/\w+>$/.test(decoder.decode(chunk))) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          controller.enqueue(concatUint8Arrays(pending.splice(0)));
        });
      }
    },
    flush(controller) {
      clearTimeout(timer);
      if (pending.length) {
        controller.enqueue(concatUint8Arrays(pending.splice(0)));
      }
    },
  });
};

export const renderHtml = async (
  opts: {
    config: Omit<ResolvedConfig, 'middleware'>;
    pathname: string;
    searchParams: URLSearchParams;
    htmlHead: string;
    renderRscForHtml: (
      input: string,
      params?: unknown,
    ) => Promise<ReadableStream>;
    getSsrConfigForHtml: (
      pathname: string,
      searchParams: URLSearchParams,
    ) => Promise<{
      input: string;
      params?: unknown;
      html: ReadableStream;
    } | null>;
  } & (
    | { isDev: false; loadModule: EntriesPrd['loadModule'] }
    | {
        isDev: true;
        rootDir: string;
        loadServerModuleMain: (idOrFileURL: string) => Promise<unknown>;
      }
  ),
): Promise<ReadableStream | null> => {
  const {
    config,
    pathname,
    searchParams,
    htmlHead,
    renderRscForHtml,
    getSsrConfigForHtml,
    isDev,
  } = opts;

  const loadClientModule = <T>(key: keyof typeof CLIENT_MODULE_MAP) =>
    (isDev
      ? opts.loadServerModuleMain(CLIENT_MODULE_MAP[key])
      : opts.loadModule(CLIENT_PREFIX + key)) as Promise<T>;

  const [
    {
      default: { renderToReadableStream },
    },
    {
      default: { createFromReadableStream },
    },
    { ServerRoot },
  ] = await Promise.all([
    loadClientModule<{ default: typeof RDServerType }>('rd-server'),
    loadClientModule<{ default: typeof RSDWClientType }>('rsdw-client'),
    loadClientModule<typeof WakuClientType>('waku-client'),
  ]);

  const ssrConfig = await getSsrConfigForHtml(pathname, searchParams);
  if (!ssrConfig) {
    return null;
  }
  let stream: ReadableStream;
  try {
    stream = await renderRscForHtml(ssrConfig.input, ssrConfig.params);
  } catch (e) {
    if (hasStatusCode(e) && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
  const moduleMap = new Proxy(
    {} as Record<string, Record<string, ImportManifestEntry>>,
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              if (isDev) {
                // TODO too long, we need to refactor this logic
                let file = filePath
                  .slice(config.basePath.length)
                  .split('?')[0]!;
                const isFsPath = file.startsWith('@fs/');
                file = '/' + (isFsPath ? file.slice('@fs/'.length) : file);
                const fileWithAbsolutePath = isFsPath
                  ? file
                  : encodeFilePathToAbsolute(joinPath(opts.rootDir, file));
                const wakuDist = joinPath(
                  fileURLToFilePath(import.meta.url),
                  '../../..',
                );
                if (fileWithAbsolutePath.startsWith(wakuDist)) {
                  const id =
                    'waku' +
                    fileWithAbsolutePath
                      .slice(wakuDist.length)
                      .replace(/\.\w+$/, '');
                  (globalThis as any).__WAKU_CLIENT_CHUNK_LOAD__(id);
                  return { id, chunks: [id], name };
                }
                const id = filePathToFileURL(file);
                (globalThis as any).__WAKU_CLIENT_CHUNK_LOAD__(id);
                return { id, chunks: [id], name };
              }
              // !isDev
              const id = filePath.slice(config.basePath.length);
              (globalThis as any).__WAKU_CLIENT_CHUNK_LOAD__(id);
              return { id, chunks: [id], name };
            },
          },
        );
      },
    },
  );
  const [stream1, stream2] = stream.tee();
  const elements: Promise<Record<string, ReactNode>> = createFromReadableStream(
    stream1,
    {
      ssrManifest: { moduleMap, moduleLoading: null },
    },
  );
  const html: Promise<ReactNode> = createFromReadableStream(ssrConfig.html, {
    ssrManifest: { moduleMap, moduleLoading: null },
  });
  const readable = (
    await renderToReadableStream(
      createElement(
        ServerRoot as FunctionComponent<
          Omit<ComponentProps<typeof ServerRoot>, 'children'>
        >,
        { elements },
        html as any,
      ),
      {
        onError(err: unknown) {
          console.error(err);
        },
      },
    )
  )
    .pipeThrough(rectifyHtml())
    .pipeThrough(
      injectHtmlHead(
        config.basePath + config.rscPath + '/' + encodeInput(ssrConfig.input),
        htmlHead,
        isDev ? `${config.basePath}${config.srcDir}/${SRC_MAIN}` : '',
      ),
    )
    .pipeThrough(injectRSCPayload(stream2));
  return readable;
};
