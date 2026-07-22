import type { Unstable_RenderHtml, Unstable_RenderRsc } from '../types.js';
import { ETAG_ID_PREFIX } from './etags.js';
import { sanitizeLog } from './log.js';

const validateRscElementIds = (elements: Record<string, unknown>) => {
  for (const id of Object.keys(elements)) {
    if (id.startsWith('_')) {
      throw new Error(
        `RSC element IDs starting with "_" are reserved for Waku internals: ${id}`,
      );
    }
  }
};

export function createRenderUtils(
  temporaryReferences: unknown,
  renderToReadableStream: (
    data: unknown,
    options?: object,
    extraOptions?: object,
  ) => ReadableStream,
  loadSsrEntryModule: () => Promise<
    typeof import('../vite-entries/entry.ssr.js')
  >,
  buildId: string,
  debugChannel?: { readable?: ReadableStream; writable?: WritableStream },
  debugId?: string,
): {
  renderRsc: Unstable_RenderRsc;
  renderHtml: Unstable_RenderHtml;
} {
  const onError = (e: unknown) => {
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof e.digest === 'string'
    ) {
      return e.digest;
    }
    console.error('Error during rendering:', sanitizeLog(e));
  };

  return {
    async renderRsc(elements, options) {
      validateRscElementIds(elements);
      const data: Record<string, unknown> = buildId
        ? { ...elements, _buildId: buildId }
        : { ...elements };
      if (options && 'value' in options) {
        data._value = options.value;
      }
      if (options?.etags) {
        for (const [slotId, etag] of Object.entries(options.etags)) {
          data[ETAG_ID_PREFIX + slotId] = etag;
        }
      }
      return renderToReadableStream(
        data,
        {
          temporaryReferences,
          onError,
          debugChannel,
        },
        {
          onClientReference(metadata: {
            id: string;
            name: string;
            deps: { js: string[]; css: string[] };
          }) {
            options?.unstable_clientModuleCallback?.(metadata.deps.js);
          },
        },
      );
    },
    async renderHtml(elementsStream, html, options) {
      const { INTERNAL_renderHtmlStream: renderHtmlStream } =
        await loadSsrEntryModule();

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });
      const htmlResult = await renderHtmlStream(elementsStream, rscHtmlStream, {
        rscPath: options.rscPath,
        formState: options.formState as never,
        nonce: options.nonce,
        extraScriptContent: options.unstable_extraScriptContent,
        debugId,
      });
      return new Response(htmlResult.stream, {
        status: htmlResult.status || options.status || 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}
