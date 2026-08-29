import type { MiddlewareHandler } from 'hono';

// with 404.tsx present, a missing route's RSC request is answered as 200
// with that page, so fetchRsc never throws and load never 404-follows.
// mix-b must be HTTP 404 so the mixed-chain pins observe load-time hops.
const http404MixB = (): MiddlewareHandler => async (c, next) => {
  const url = new URL(c.req.raw.url);
  if (url.pathname === '/RSC/R/mix-b.txt') {
    c.res = new Response('Not Found', { status: 404 });
    return;
  }
  return next();
};

export default http404MixB;
