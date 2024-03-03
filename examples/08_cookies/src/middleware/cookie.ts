import * as cookie from 'cookie';

import type { Middleware } from 'waku/config';

// XXX we would probably like to extend config.
const COOKIE_OPTS = {};

const cookieMiddleware: Middleware = () => {
  return async (ctx, next) => {
    const cookies = cookie.parse(ctx.req.headers.cookie || '');
    ctx.context.count = Number(cookies.count) || 0;
    await next();
    ctx.res.headers ||= {};
    let origSetCookie = ctx.res.headers['set-cookie'] || ([] as string[]);
    if (typeof origSetCookie === 'string') {
      origSetCookie = [origSetCookie];
    }
    ctx.res.headers['set-cookie'] = [
      ...origSetCookie,
      cookie.serialize('count', String(ctx.context.count), COOKIE_OPTS),
    ];
  };
};

export default cookieMiddleware;
