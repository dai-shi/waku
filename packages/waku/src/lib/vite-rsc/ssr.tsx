import { type ReactNode, captureOwnerStack, use } from 'react';
import { createFromReadableStream as createFromReadableStreamBase } from '@vitejs/plugin-rsc/ssr';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';
import htmlShell from 'virtual:vite-rsc-waku/html-shell';
import { INTERNAL_ServerRoot } from '../../minimal/client.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { sanitizeLog } from '../utils/log.js';
import { waitForRootPrerequisites } from '../utils/rsc-stream.js';
import { getBootstrapPreamble } from '../utils/ssr.js';
import { batchReadableStream, deferReadableStream } from '../utils/stream.js';

function createFromReadableStream<T>(
  stream: ReadableStream<Uint8Array>,
): Promise<T> {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  const deferredStream = deferReadableStream(stream, promise);
  const root = createFromReadableStreamBase<T>(deferredStream);
  waitForRootPrerequisites(root).then(resolve, resolve);
  return root;
}

type RenderHtmlStream = (
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options: {
    rscPath: string | undefined;
    formState: ReactFormState | undefined;
    nonce: string | undefined;
    extraScriptContent: string | undefined;
    debugId: string | undefined;
  },
) => Promise<{ stream: ReadableStream; status: number | undefined }>;

type RscElementsPayload = Record<string, unknown>;
type RscHtmlPayload = ReactNode;

// This code runs on `ssr` environment,
// i.e. it runs on server but without `react-server` condition.
// These utilities are used by `rsc` environment through
// `import.meta.viteRsc.loadModule` API.

export const renderHtmlStream: RenderHtmlStream = async (
  rscStream,
  rscHtmlStream,
  options,
) => {
  const [stream1, stream2] = rscStream.tee();

  let elementsPromise: Promise<RscElementsPayload>;
  let htmlPromise: Promise<RscHtmlPayload>;

  // deserialize RSC stream back to React VDOM
  function SsrRoot() {
    // RSC stream needs to be deserialized inside SSR component.
    // This is for ReactDomServer preinit/preload (e.g. client reference modulepreload, css)
    // https://github.com/facebook/react/pull/31799#discussion_r1886166075
    elementsPromise ??= createFromReadableStream<RscElementsPayload>(stream1);
    htmlPromise ??= createFromReadableStream<RscHtmlPayload>(rscHtmlStream);
    return (
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        {use(htmlPromise)}
      </INTERNAL_ServerRoot>
    );
  }

  // render html
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  let htmlStream: Awaited<ReturnType<typeof renderToReadableStream>>;
  let status: number | undefined;
  try {
    htmlStream = await renderToReadableStream(<SsrRoot />, {
      bootstrapScriptContent:
        getBootstrapPreamble({
          hydrate: true,
          debugId: options.debugId,
        }) +
        bootstrapScriptContent +
        (options.extraScriptContent || ''),
      onError: (e: unknown) => {
        if (
          e &&
          typeof e === 'object' &&
          'digest' in e &&
          typeof e.digest === 'string'
        ) {
          return e.digest;
        }
        console.error(
          '[SSR Error]',
          sanitizeLog(captureOwnerStack?.() || ''),
          '\n',
          sanitizeLog(e),
        );
      },
      ...(options.nonce ? { nonce: options.nonce } : {}),
      ...(options.formState ? { formState: options.formState } : {}),
    });
  } catch (e) {
    const info = getErrorInfo(e);
    if (info?.location) {
      // keep unstable_redirect error as http redirection
      throw e;
    }
    status = info?.status || 500;
    // SSR empty html and go full CSR on browser, which can revive RSC errors.
    const ssrErrorRoot = (
      <html>
        <body></body>
      </html>
    );
    htmlStream = await renderToReadableStream(ssrErrorRoot, {
      bootstrapScriptContent:
        getBootstrapPreamble({
          hydrate: false,
        }) +
        bootstrapScriptContent +
        (options.extraScriptContent || ''),
      ...(options.nonce ? { nonce: options.nonce } : {}),
    });
  }
  const responseStream: ReadableStream<Uint8Array> = htmlStream.pipeThrough(
    injectRSCPayload(
      batchReadableStream(stream2),
      options.nonce ? { nonce: options.nonce } : {},
    ),
  );

  return { stream: responseStream, status };
};

export async function renderHtmlFallback() {
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  const html = htmlShell.replace(
    '</body>',
    () => `<script>${bootstrapScriptContent}</script></body>`,
  );
  return html;
}

function loadBootstrapScriptContent(): Promise<string> {
  return import.meta.viteRsc.loadBootstrapScriptContent('index');
}
