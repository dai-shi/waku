import type { Hono } from 'hono';
import type { Config } from 'waku/config';

const wakuConfig: Config = {
  ...(import.meta.env && !import.meta.env.PROD
    ? {
        unstable_honoEnhancer: ((createApp: (app: Hono) => Hono) => {
          const handlerPromise = import(
            './src/hono/waku.cloudflare-dev-server'
          ).then(({ cloudflareDevServer }) =>
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
      import('waku/middleware/dev-server'),
      import('waku/middleware/headers'),
      import('waku/middleware/ssr'),
      import('waku/middleware/rsc'),
    ];
  },
};

export default wakuConfig;
