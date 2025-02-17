import type { Middleware } from 'waku/config';

export type HandlerReq = {
  body: ReadableStream;
  url: URL;
  method: string;
  headers: Record<string, string>;
};
export type HandlerRes = {
  body?: ReadableStream;
  headers?: Record<string, string | string[]>;
  status?: number;
};
export type HandlerContext = {
  readonly req: HandlerReq;
  readonly res: HandlerRes;
  readonly context: Record<string, unknown>;
};

function isWranglerDev(headers?: Record<string, string | string[]>): boolean {
  // This header seems to only be set for production cloudflare workers
  return !headers?.['cf-visitor'];
}

const cloudflareMiddleware: Middleware = () => {
  return async (ctx, next) => {
    await next();
    if (!import.meta.env?.PROD) {
      return;
    }
    if (!isWranglerDev(ctx.req)) {
      return;
    }
    const contentType = ctx.res.headers?.['content-type'];
    if (
      !contentType ||
      contentType.includes('text/html') ||
      contentType.includes('text/plain')
    ) {
      ctx.res.headers ||= {};
      ctx.res.headers['content-encoding'] = 'Identity';
    }
  };
};

export default cloudflareMiddleware;
