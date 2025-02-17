import type { Middleware } from 'waku/config';
import type { Env } from 'hono';
import { getHonoContext as _getHonoContext } from 'waku/unstable_hono';

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

export type HonoContextType<E extends Env = Env> = ReturnType<
  typeof _getHonoContext<E>
>;

export const getHonoContext = <E extends Env = Env>(
  ctx?: HandlerContext,
): HonoContextType<E> | null => {
  try {
    if (ctx) {
      return ctx.context.__hono_context as HonoContextType<E>;
    }
    if ((globalThis as Record<string, unknown>).__hono_context) {
      return (globalThis as Record<string, unknown>)
        .__hono_context as HonoContextType<E>;
    }
    const c = _getHonoContext<E>();
    if (!c) {
      return null;
    }
    return c;
  } catch {
    return null;
  }
};

function isWranglerDev(headers: Headers | undefined): boolean {
  // This header seems to only be set for production cloudflare workers
  return Boolean(headers && !headers.has('cf-visitor'));
}

const cloudflareMiddleware: Middleware = () => {
  return async (ctx, next) => {
    await next();
    if (!import.meta.env?.PROD) {
      return;
    }
    const c = getHonoContext(ctx as HandlerContext);
    if (!isWranglerDev(c?.req.raw.headers)) {
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
