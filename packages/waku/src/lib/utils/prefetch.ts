const KEY_RSC_PATH = 'p';
const KEY_RESPONSE = 'r';
const KEY_CLOSE = 'x';
const KEY_RSC_PARAMS = 'q';
const KEY_TEMPORARY_REFERENCES = 't';
const KEY_DEBUG_ID = 'd';

export type INTERNAL_PrefetchedEntry = {
  [KEY_RSC_PATH]: string;
  [KEY_RESPONSE]: Promise<Response>;
  [KEY_CLOSE]?: () => void;
  [KEY_RSC_PARAMS]?: unknown;
  [KEY_TEMPORARY_REFERENCES]?: unknown;
  [KEY_DEBUG_ID]?: string;
};

export const createPrefetchedEntry = (
  rscPath: string,
  response: Promise<Response>,
  rscParams?: unknown,
  temporaryReferences?: unknown,
): INTERNAL_PrefetchedEntry => ({
  [KEY_RSC_PATH]: rscPath,
  [KEY_RESPONSE]: response,
  ...(rscParams !== undefined ? { [KEY_RSC_PARAMS]: rscParams } : {}),
  ...(temporaryReferences !== undefined
    ? { [KEY_TEMPORARY_REFERENCES]: temporaryReferences }
    : {}),
});

export const getPrefetchedRscPath = (entry: INTERNAL_PrefetchedEntry) =>
  entry[KEY_RSC_PATH];

export const getPrefetchedResponse = (entry: INTERNAL_PrefetchedEntry) =>
  entry[KEY_RESPONSE];

export const getPrefetchedClose = (entry: INTERNAL_PrefetchedEntry) =>
  entry[KEY_CLOSE];

export const getPrefetchedRscParams = (entry: INTERNAL_PrefetchedEntry) =>
  entry[KEY_RSC_PARAMS];

export const getPrefetchedTemporaryReferences = <T>(
  entry: INTERNAL_PrefetchedEntry,
) => entry[KEY_TEMPORARY_REFERENCES] as T | undefined;

export const getPrefetchedDebugId = (entry: INTERNAL_PrefetchedEntry) =>
  entry[KEY_DEBUG_ID];

export const createInitialPrefetchedEntryCode = (
  rscPath: string,
  debugId: string | undefined,
) =>
  `
  (() => {
    const e = {};
    e.${KEY_RSC_PATH} = ${JSON.stringify(rscPath)};
    e.${KEY_RESPONSE} = Promise.resolve(new Response(new ReadableStream({
      start(c) {
        const d = (window.__FLIGHT_DATA ||= []);
        const t = new TextEncoder();
        const f = (s) => c.enqueue(typeof s === 'string' ? t.encode(s) : s);
        d.forEach(f);
        d.length = 0;
        d.push = f;
        e.${KEY_CLOSE} = () => {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => c.close());
          } else {
            c.close();
          }
        };
      }
    })));
    ${debugId ? `e.${KEY_DEBUG_ID} = ${JSON.stringify(debugId)};` : ''}
    return e;
  })()
`
    .split('\n')
    .map((line) => line.trim())
    .join('');
