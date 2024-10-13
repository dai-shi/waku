import { new_defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';

export default new_defineEntries({
  unstable_handleRequest: async (
    config,
    req,
    { renderRsc, decodeRscPath, renderHtml },
  ) => {
    const basePrefix = config.basePath + config.rscBase + '/';
    if (req.url.pathname.startsWith(basePrefix)) {
      const rscPath = decodeRscPath(
        decodeURI(req.url.pathname.slice(basePrefix.length)),
      );
      return renderRsc({ App: <App name={rscPath || 'Waku'} /> });
    }
    if (req.url.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, '');
    }
  },
  unstable_getBuildConfig: async () => [
    { pathname: '/', entries: [{ rscPath: '' }] },
  ],
});
