// Workaround https://github.com/cloudflare/workers-sdk/issues/6577
import type { Middleware } from 'waku/config';

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
    if (!isWranglerDev(ctx.req.headers)) {
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
