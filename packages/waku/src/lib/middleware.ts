import type { MiddlewareHandler } from 'hono';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type ReqObject = {
  stream: ReadableStream;
  url: string; // Full URL like "https://example.com/foo/bar?baz=qux"
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

export type ResObject = {
  stream: WritableStream;
  setHeader: (name: string, value: string) => void;
  setStatus: (code: number) => void;
};

export type Middleware<Req extends ReqObject, Res extends ResObject> = (
  req: Req,
  res: Res,
  next: (err?: unknown) => void,
) => void;

const createEmptyReadableStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

const createStreamPair = (
  callback: (redable: ReadableStream | null) => void,
) => {
  let controller: ReadableStreamDefaultController;
  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  let hasData = false;
  const writable = new WritableStream({
    write(chunk) {
      controller.enqueue(chunk);
      if (!hasData) {
        hasData = true;
        callback(readable);
      }
    },
    close() {
      controller.close();
      if (!hasData) {
        callback(null);
      }
    },
  });
  return writable;
};

export function honoWrapper(
  m: Middleware<ReqObject, ResObject>,
): MiddlewareHandler {
  return (c, next) =>
    new Promise((resolve) => {
      const req: ReqObject = {
        stream: c.req.raw.body || createEmptyReadableStream(),
        method: c.req.method,
        url: c.req.url,
        headers: Object.fromEntries(
          Array.from(c.req.raw.headers.entries()).map(([k, v]) => [k, v]),
        ),
      };
      const writable = createStreamPair((readable) => {
        resolve(c.body(readable));
      });
      const res: ResObject = {
        stream: writable,
        setStatus: (code) => c.status(code),
        setHeader: (name, value) => c.header(name, value),
      };
      m(req, res, () => next().then(resolve));
    });
}

export function connectWrapper(m: Middleware<ReqObject, ResObject>) {
  return async (
    connectReq: IncomingMessage,
    connectRes: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const { Readable, Writable } = await import('node:stream');
    const req: ReqObject = {
      stream: Readable.toWeb(connectReq) as any,
      method: connectReq.method || '',
      url: new URL(
        connectReq.url || '',
        `http://${connectReq.headers.host}`,
      ).toString(),
      headers: connectReq.headers,
    };
    const res: ResObject = {
      stream: Writable.toWeb(connectRes),
      setStatus: (code) => (connectRes.statusCode = code),
      setHeader: (name, value) => connectRes.setHeader(name, value),
    };
    m(req, res, next);
  };
}
