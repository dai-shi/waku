import type { Middleware } from 'waku/config';

const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

const apiMiddleware: Middleware = () => {
  return async (ctx, next) => {
    const path = ctx.req.url.pathname;
    if (path === '/api/hello') {
      ctx.res.body = stringToStream('world');
      return;
    }
    await next();
  };
};

export default apiMiddleware;
