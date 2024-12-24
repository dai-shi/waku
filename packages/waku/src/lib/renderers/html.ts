import { createElement } from 'react';
import type { ReactNode, FunctionComponent, ComponentProps } from 'react';
import type * as RDServerType from 'react-dom/server.edge';
import type { default as RSDWClientType } from 'react-server-dom-webpack/client.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';

import type * as WakuMinimalClientType from '../../minimal/client.js';
import type { PureConfig } from '../config.js';
import { SRC_MAIN } from '../constants.js';
import { concatUint8Arrays } from '../utils/stream.js';
import { filePathToFileURL } from '../utils/path.js';
import { encodeRscPath } from './utils.js';
import { renderRsc, renderRscElement, getExtractFormState } from './rsc.js';
// TODO move types somewhere
import type { HandlerContext } from '../middleware/types.js';

// This should be consistent with the one in vite-plugin-rsc-index.ts
const DEFAULT_HTML_HEAD = [
  createElement('meta', { charSet: 'utf-8' }),
  createElement('meta', {
    name: 'viewport',
    content: 'width=device-width, initial-scale=1',
  }),
  createElement('meta', { name: 'generator', content: 'Waku' }),
];

type Elements = Record<string, ReactNode>;

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
    head = head.slice(0, -CLOSING_HEAD.length) + htmlHead + CLOSING_HEAD;
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

export async function renderHtml(
  config: PureConfig,
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer'>,
  htmlHead: string,
  elements: Elements,
  html: ReactNode,
  rscPath: string,
  actionResult?: unknown,
): Promise<ReadableStream & { allReady: Promise<void> }> {
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { renderToReadableStream },
  } = modules.rdServer as { default: typeof RDServerType };
  const {
    default: { createFromReadableStream },
  } = modules.rsdwClient as { default: typeof RSDWClientType };
  const { ServerRootInternal: ServerRoot } =
    modules.wakuMinimalClient as typeof WakuMinimalClientType;

  const stream = await renderRsc(config, ctx, elements);
  const htmlStream = renderRscElement(config, ctx, html);
  const isDev = !!ctx.unstable_devServer;
  const moduleMap = new Proxy(
    {} as Record<string, Record<string, ImportManifestEntry>>,
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              if (isDev) {
                let id = filePath.slice(config.basePath.length);
                if (id.startsWith('@id/')) {
                  id = id.slice('@id/'.length);
                } else if (id.startsWith('@fs/')) {
                  id = filePathToFileURL(id.slice('@fs'.length));
                } else {
                  id = filePathToFileURL(id);
                }
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
  const elementsPromise: Promise<Elements> = createFromReadableStream(stream1, {
    serverConsumerManifest: { moduleMap, moduleLoading: null },
  });
  const htmlNode: Promise<ReactNode> = createFromReadableStream(htmlStream, {
    serverConsumerManifest: { moduleMap, moduleLoading: null },
  });
  const readable = await renderToReadableStream(
    createElement(
      ServerRoot as FunctionComponent<
        Omit<ComponentProps<typeof ServerRoot>, 'children'>
      >,
      { elements: elementsPromise },
      ...DEFAULT_HTML_HEAD,
      htmlNode as any,
    ),
    {
      formState:
        actionResult === undefined
          ? null
          : await getExtractFormState(ctx)(actionResult),
      onError(err: unknown) {
        console.error(err);
      },
    },
  );
  const injected: ReadableStream & { allReady?: Promise<void> } = readable
    .pipeThrough(rectifyHtml())
    .pipeThrough(
      injectHtmlHead(
        config.basePath + config.rscBase + '/' + encodeRscPath(rscPath),
        htmlHead,
        isDev ? `${config.basePath}${config.srcDir}/${SRC_MAIN}` : '',
      ),
    )
    .pipeThrough(injectRSCPayload(stream2));
  injected.allReady = readable.allReady;
  return injected as never;
}
