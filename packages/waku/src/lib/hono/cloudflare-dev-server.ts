/* eslint import/no-unresolved: 0 */
import type { Hono } from 'hono';

export const cloudflareDevServer = (app: Hono, cfOptions?: any) => {
  try {
    // @ts-expect-error: miniflare is a peer dependency (provided by miniflare)
    const wsAssign = import('miniflare').then(({ WebSocketPair }) => {
      Object.assign(globalThis, { WebSocketPair });
    });

    // @ts-expect-error: wrangler is a peer dependency
    const proxy = import('wrangler').then(({ getPlatformProxy }) =>
      getPlatformProxy({
        ...(cfOptions || {}),
      }).then((proxy: any) => {
        return proxy;
      }),
    );

    return async (req: Request) => {
      await wsAssign;
      const awaitedProxy = await proxy;
      Object.assign(req, { cf: awaitedProxy.cf });
      Object.assign(globalThis, {
        caches: awaitedProxy.caches,
      });
      return app.fetch(req, awaitedProxy.env, awaitedProxy.ctx);
    };
  } catch (e) {
    console.warn(
      'Unable to set up Cloudflare dev server. Try installing wrangler to your dev dependencies.',
      e,
    );
    return undefined;
  }
};
