import type { MiddlewareHandler, Context, Env, Input } from 'hono';

import type { BaseReq, BaseRes, Handler } from '../rsc/types.js';
import { createHandler } from '../rsc/handler.js';

const createEmptyReadableStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

const createStreamPair = (
  callback: (redable: ReadableStream | null) => void,
  signal: AbortSignal,
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
      if (signal.aborted) {
        return;
      }
      controller.enqueue(chunk);
      if (!hasData) {
        hasData = true;
        callback(readable);
      }
    },
    close() {
      if (signal.aborted) {
        return;
      }
      controller.close();
      if (!hasData) {
        callback(null);
      }
    },
  });
  return writable;
};

const honoWrapper = <E extends Env, P extends string, I extends Input>(
  m: Handler<
    BaseReq & { c: Context<E, P, I> },
    BaseRes & { c: Context<E, P, I> }
  >,
): MiddlewareHandler<E, P, I> => {
  return (c, next) =>
    new Promise((resolve) => {
      const req: BaseReq & { c: Context<E, P, I> } = {
        stream: c.req.raw.body || createEmptyReadableStream(),
        method: c.req.method,
        url: c.req.url,
        contentType: c.req.header('content-type'),
        c,
      };
      const writable = createStreamPair((readable) => {
        resolve(c.body(readable));
      }, c.req.raw.signal);
      const res: BaseRes & { c: Context<E, P, I> } = {
        stream: writable,
        setStatus: (code) => c.status(code),
        setHeader: (name, value) => c.header(name, value),
        c,
      };
      m(req, res, () => next().then(resolve));
    });
};

export function honoMiddleware<
  // FIXME type defaults are weird
  E extends Env = never,
  P extends string = string,
  I extends Input = Record<string, never>,
>(...args: Parameters<typeof createHandler>) {
  return honoWrapper<E, P, I>(createHandler(...args));
}
