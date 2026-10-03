// TODO: this WS debug channel keeps dev payloads lean by offloading React's
// Server Components debug info (component stacks, timing, console, async
// metadata) out of the main Flight stream. Our transport is bespoke: paired
// HMR events here plus the debug-id header hack in rsc-devtools.ts. Waku is
// cited as prior art for a shared @vitejs/plugin-rsc debug-channel example
// (https://github.com/vitejs/vite-plugin-react/issues/1306). Once that lands,
// consider adopting it so we can delete our own transport and rsc-devtools.ts.

import {
  base64ToBytes,
  bytesToBase64,
} from '../utils-isomorphic/base64-web.js';
import {
  DEBUG_CMD_EVENT,
  DEBUG_DATA_EVENT,
  DEBUG_ID_HEADER,
  assertIsDebugEventPayload,
} from '../utils-isomorphic/react-debug-channel.js';
import type { DebugEventPayload } from '../utils-isomorphic/react-debug-channel.js';

const createWsDebugChannel = (debugId: string) => {
  const hot = import.meta.hot!;
  let closed = false;
  let onDataEvent: ((payload: unknown) => void) | undefined;

  const cleanup = (notify?: boolean) => {
    if (closed) {
      return;
    }
    closed = true;
    if (onDataEvent) {
      hot.off(DEBUG_DATA_EVENT, onDataEvent);
    }
    if (notify) {
      hot.send(DEBUG_CMD_EVENT, {
        i: debugId,
        d: true,
      } satisfies DebugEventPayload);
    }
  };

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      onDataEvent = (payload: unknown) => {
        assertIsDebugEventPayload(payload);
        if (closed || payload.i !== debugId) {
          return;
        }
        if ('b' in payload) {
          // chunk
          controller.enqueue(base64ToBytes(payload.b));
        }
        if ('d' in payload) {
          // done
          cleanup();
          controller.close();
        }
      };
      hot.on(DEBUG_DATA_EVENT, onDataEvent);
      hot.send(DEBUG_CMD_EVENT, { i: debugId } satisfies DebugEventPayload);
    },
    cancel() {
      cleanup(true);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (closed) {
        throw new Error('Channel is closed');
      }
      hot.send(DEBUG_CMD_EVENT, {
        i: debugId,
        b: bytesToBase64(chunk),
      } satisfies DebugEventPayload);
    },
    close() {
      cleanup(true);
    },
    abort() {
      cleanup(true);
    },
  });

  return { readable, writable };
};

export const setupDebugChannel = (
  baseFetchFn: typeof fetch,
  prefetched: boolean,
  debugId?: string,
) => {
  if (prefetched) {
    if (debugId) {
      const debugChannel = createWsDebugChannel(debugId);
      return { debugChannel };
    }
    return {};
  }

  const newDebugId = crypto.randomUUID();
  const debugChannel = createWsDebugChannel(newDebugId);
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set(DEBUG_ID_HEADER, newDebugId);
    return baseFetchFn(input, {
      ...init,
      headers,
    });
  }) as typeof fetch;
  return { fetchFn, debugChannel };
};
