import type { Plugin } from 'vite';
import { base64ToBytes, bytesToBase64 } from '../utils/base64-node.js';
import {
  DEBUG_CMD_EVENT,
  DEBUG_DATA_EVENT,
  DEBUG_ID_HEADER,
  type DebugEventPayload,
  assertIsDebugEventPayload,
} from '../utils/react-debug-channel.js';

const getDebugChannels = () =>
  (globalThis.__WAKU_DEBUG_CHANNELS__ ||= new Map());

const setRequestHeader = (
  req: {
    headers: Record<string, string | string[] | undefined>;
    rawHeaders?: string[];
  },
  name: string,
  value: string,
) => {
  const lowerName = name.toLowerCase();
  req.headers[lowerName] = value;
  if (!req.rawHeaders) {
    return;
  }
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]?.toLowerCase() === lowerName) {
      req.rawHeaders[i + 1] = value;
      return;
    }
  }
  req.rawHeaders.push(name, value);
};

type Session = {
  pendingChunks?: Uint8Array[];
  ended: boolean;
  cmdController?: ReadableStreamDefaultController<Uint8Array>;
};

export function rscDevtoolsPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:rsc-devtools',
    configureServer(server) {
      const hot = server.environments.client.hot;
      const sessions = new Map<string, Session>();

      const sendChunk = (debugId: string, chunk: Uint8Array) => {
        hot.send(DEBUG_DATA_EVENT, {
          i: debugId,
          b: bytesToBase64(chunk),
        } satisfies DebugEventPayload);
      };

      const closeCmdController = (session: Session) => {
        const controller = session.cmdController;
        if (!controller) {
          return;
        }
        delete session.cmdController;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      const enqueueCmdChunk = (session: Session, chunk: Uint8Array) => {
        const controller = session.cmdController;
        if (!controller) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          delete session.cmdController;
        }
      };

      const flushPendingChunks = (debugId: string, session: Session) => {
        const pendingChunks = session.pendingChunks;
        if (!pendingChunks) {
          return;
        }
        for (const chunk of pendingChunks) {
          sendChunk(debugId, chunk);
        }
        delete session.pendingChunks;
      };

      const cleanupIfEnded = (debugId: string, session: Session) => {
        if (session.pendingChunks || !session.ended) {
          return;
        }
        getDebugChannels().delete(debugId);
        sessions.delete(debugId);
        hot.send(DEBUG_DATA_EVENT, {
          i: debugId,
          d: true,
        } satisfies DebugEventPayload);
      };

      hot.on(DEBUG_CMD_EVENT, (payload) => {
        assertIsDebugEventPayload(payload);
        const session = sessions.get(payload.i);
        if ('d' in payload) {
          // done
          if (session) {
            closeCmdController(session);
          }
          return;
        }
        if ('b' in payload) {
          // chunk
          if (session) {
            enqueueCmdChunk(session, base64ToBytes(payload.b));
          }
          return;
        }
        // ready
        if (session) {
          flushPendingChunks(payload.i, session);
          cleanupIfEnded(payload.i, session);
        } else {
          sessions.set(payload.i, { ended: false });
        }
      });

      const registerDebugChannel = (debugId: string) => {
        let session = sessions.get(debugId);
        if (!session) {
          session = { pendingChunks: [], ended: false };
          sessions.set(debugId, session);
        }
        const readable = new ReadableStream<Uint8Array>({
          start(controller) {
            session.cmdController = controller;
          },
          cancel() {
            delete session.cmdController;
          },
        });
        const writable = new WritableStream<Uint8Array>({
          write(chunk) {
            if (session.pendingChunks) {
              session.pendingChunks.push(chunk);
            } else {
              sendChunk(debugId, chunk);
            }
          },
          close() {
            session.ended = true;
            cleanupIfEnded(debugId, session);
          },
          abort() {
            session.ended = true;
            cleanupIfEnded(debugId, session);
          },
        });
        getDebugChannels().set(debugId, { writable, readable });
      };

      return () => {
        server.middlewares.use((req, _res, next) => {
          const clientDebugId = req.headers[DEBUG_ID_HEADER.toLowerCase()];
          const hasClientDebugId = typeof clientDebugId === 'string';
          const isHtmlRequest = req.headers.accept?.includes('text/html');
          if (!hasClientDebugId && !isHtmlRequest) {
            next();
            return;
          }

          const debugId = hasClientDebugId
            ? clientDebugId
            : crypto.randomUUID();
          if (!hasClientDebugId) {
            setRequestHeader(req, DEBUG_ID_HEADER, debugId);
          }
          registerDebugChannel(debugId);
          next();
        });
      };
    },
  };
}
