//import cookie from 'cookie';
import { getCookie, getSignedCookie, setCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
export const prehook=(req, res, ctx) => {
    //const cookies = cookie.parse(req.c.req.raw.headers.get('Cookie'));
    const count=getCookie(req.c,'count')??0;
    console.log('prehook',count);
    return {count}
}

export const posthook=(req, res, ctx) => {
    //res.c.res.headers.append("Set-Cookie",`count=${String(ctx.count)}`);
    setCookie(res.c,'count',String(ctx.count));
  }