import type { Hono } from 'hono';

const honoEnhancer = (createApp: (app: Hono) => Hono) => {
  if (import.meta.env && !import.meta.env.PROD) {
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
  }
  return createApp;
};

export default honoEnhancer;
