import type { MiddlewareHandler, Context, Env, Input } from 'hono';

import type { ReqObject, ResObject, Middleware } from './types.js';

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
