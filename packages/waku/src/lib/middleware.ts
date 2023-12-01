import type { MiddlewareHandler, Context, Env, Input } from 'hono';
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

export function honoWrapper<
  // FIXME type defaults are weird
  E extends Env = never,
  P extends string = string,
  I extends Input = Record<string, never>,
>(
  m: Middleware<
    ReqObject & { c: Context<E, P, I> },
    ResObject & { c: Context<E, P, I> }
  >,
): MiddlewareHandler<E, P, I> {
  return (c, next) =>
    new Promise((resolve) => {
      const req: ReqObject & { c: Context<E, P, I> } = {
        stream: c.req.raw.body || createEmptyReadableStream(),
        method: c.req.method,
        url: c.req.url,
        headers: Object.fromEntries(
          Array.from(c.req.raw.headers.entries()).map(([k, v]) => [k, v]),
        ),
        c,
      };
      const writable = createStreamPair((readable) => {
        resolve(c.body(readable));
      });
      const res: ResObject & { c: Context<E, P, I> } = {
        stream: writable,
        setStatus: (code) => c.status(code),
        setHeader: (name, value) => c.header(name, value),
        c,
      };
      m(req, res, () => next().then(resolve));
    });
}

export function connectWrapper(
  m: Middleware<
    ReqObject & { orig: IncomingMessage },
    ResObject & { orig: ServerResponse }
  >,
) {
  return async (
    connectReq: IncomingMessage,
    connectRes: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const { Readable, Writable } = await import('node:stream');
    const req: ReqObject & { orig: IncomingMessage } = {
      stream: Readable.toWeb(connectReq) as any,
      method: connectReq.method || '',
      url: new URL(
        connectReq.url || '',
        `http://${connectReq.headers.host}`,
      ).toString(),
      headers: connectReq.headers,
      orig: connectReq,
    };
    const res: ResObject & { orig: ServerResponse } = {
      stream: Writable.toWeb(connectRes),
      setStatus: (code) => (connectRes.statusCode = code),
      setHeader: (name, value) => connectRes.setHeader(name, value),
      orig: connectRes,
    };
    m(req, res, next);
  };
}
