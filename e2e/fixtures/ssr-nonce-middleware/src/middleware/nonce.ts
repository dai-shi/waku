import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { contextStorage } from 'hono/context-storage';
import { NONCE, secureHeaders } from 'hono/secure-headers';

const nonceMiddleware = (): MiddlewareHandler =>
  every(
    contextStorage(),
    secureHeaders({
      contentSecurityPolicy: {
        scriptSrc: ["'self'", NONCE],
      },
    }),
  );

export default nonceMiddleware;
