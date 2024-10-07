import type { Middleware } from 'waku/config';

const redirectsMiddleware: Middleware = () => async (ctx, next) => {
  switch (ctx.req.url.pathname) {
    case '/redirect':
      ctx.res.status = 302;
      ctx.res.headers = {
        Location: '/exists',
      };
      break;
    case '/broken-redirect':
      ctx.res.status = 302;
      ctx.res.headers = {
        Location: '/broken',
      };
      break;
    default:
      return await next();
  }
};

export default redirectsMiddleware;
