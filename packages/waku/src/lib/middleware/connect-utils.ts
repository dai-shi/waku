import type { IncomingMessage, ServerResponse } from 'node:http';

import type { BaseReq, BaseRes, Handler } from '../handlers/types.js';

export const connectWrapper = (
  m: Handler<
    BaseReq & { orig: IncomingMessage },
    BaseRes & { orig: ServerResponse }
  >,
) => {
  return async (
    connectReq: IncomingMessage,
    connectRes: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const { Readable, Writable } = await import('node:stream').catch((e) => {
      // XXX explicit catch to avoid bundle time error
      throw e;
    });
    const req: BaseReq & { orig: IncomingMessage } = {
      stream: Readable.toWeb(connectReq) as any,
      method: connectReq.method || '',
      url: new URL(connectReq.url || '', `http://${connectReq.headers.host}`),
      contentType: connectReq.headers['content-type'],
      orig: connectReq,
    };
    const res: BaseRes & { orig: ServerResponse } = {
      stream: Writable.toWeb(connectRes),
      setStatus: (code) => (connectRes.statusCode = code),
      setHeader: (name, value) => connectRes.setHeader(name, value),
      orig: connectRes,
    };
    m(req, res, next);
  };
};
