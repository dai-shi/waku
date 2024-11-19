import { new_defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/app';

export default new_defineEntries({
  unstable_handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, '');
    }
  },
  unstable_getBuildConfig: async () => [
    { pathSpec: [], entries: [{ rscPath: '' }] },
  ],
});
