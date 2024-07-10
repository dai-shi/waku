import type { Middleware } from 'waku/config';
import wakuConfig from '../../waku.config.js';

const { rscPath } = wakuConfig;

const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

const validateMiddleware: Middleware = () => {
  return async (ctx, next) => {
    if (
      ctx.req.url.pathname === '/invalid' ||
      ctx.req.url.pathname.startsWith(`/${rscPath}/invalid`)
    ) {
      ctx.res.status = 401;
      ctx.res.body = stringToStream('Unauthorized');
      return;
    }
    await next();
  };
};

export default validateMiddleware;
