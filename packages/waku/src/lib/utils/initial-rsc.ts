// The initial RSC entry is emitted as an inline script during SSR. It carries
// the streamed RSC payload of the first render as a `Response`, so the client
// can hydrate without an extra round trip. It is consumed exactly once.

// This is exported only for global-types.ts. It is not a public API.
export type InitialRscEntry = {
  response: Promise<Response>;
  close: () => void;
  debugId?: string;
};

export const consumeInitialRscEntry = (): InitialRscEntry | undefined => {
  const entry = globalThis.__WAKU_INITIAL_RSC__;
  if (entry) {
    globalThis.__WAKU_INITIAL_RSC__ = undefined;
  }
  return entry;
};

export const createInitialRscEntryCode = (debugId: string | undefined) =>
  `
  (() => {
    const e = {};
    e.response = Promise.resolve(new Response(new ReadableStream({
      start(c) {
        const d = (window.__FLIGHT_DATA ||= []);
        const t = new TextEncoder();
        const f = (s) => c.enqueue(typeof s === 'string' ? t.encode(s) : s);
        d.forEach(f);
        d.length = 0;
        d.push = f;
        e.close = () => {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => c.close());
          } else {
            c.close();
          }
        };
      }
    })));
    ${debugId ? `e.debugId = ${JSON.stringify(debugId)};` : ''}
    return e;
  })()
`
    .split('\n')
    .map((line) => line.trim())
    .join('');
