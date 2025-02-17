import type { Hono } from 'hono';
import { type Config, defineConfig } from 'waku/config';

export default defineConfig({
  ...(import.meta.env && !import.meta.env.PROD
    ? {
        unstable_honoEnhancer: ((createApp: (app: Hono) => Hono) => {
          const handlerPromise = import('./waku.cloudflare-dev-server').then(
            ({ cloudflareDevServer }) =>
              cloudflareDevServer({
                // Optional config settings for the Cloudflare dev server (wrangler proxy)
                // https://developers.cloudflare.com/workers/wrangler/api/#parameters-1
                persist: {
                  path: '.wrangler/state/v3',
                },
              }),
          );
          return (appToCreate: Hono) => {
            const app = createApp(appToCreate);
            return {
              fetch: async (req: Request) => {
                const devHandler = await handlerPromise;
                return devHandler(req, app);
              },
            };
          };
        }) as Config['unstable_honoEnhancer'],
      }
    : {}),
  middleware: () => {
    return [
      import('waku/middleware/context'),
      import('waku/middleware/dev-server'),
      import('./waku.cloudflare-middleware'),
      import('waku/middleware/handler'),
    ];
  },
});
