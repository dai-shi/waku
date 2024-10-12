import {
  new_defineEntries,
  unstable_renderRsc as renderRsc,
} from 'waku/server';

import App from './components/App';

export default new_defineEntries({
  unstable_handleRequest: async (config, ctx) => {
    const basePrefix = config.basePath + config.rscBase + '/';
    if (ctx.req.url.pathname.startsWith(basePrefix)) {
      // const rscPath = decodeRscPath(
      //   decodeURI(ctx.req.url.pathname.slice(basePrefix.length)),
      // );
      ctx.res.body = renderRsc(config, ctx, { App: <App name="Waku" /> });
    }
  },
  unstable_getBuildConfig: async () => [
    { pathname: '/', entries: [{ rscPath: '' }] },
  ],
});
