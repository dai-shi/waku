import { new_defineEntries } from 'waku/minimal/server';

import App from './components/App.js';

const entries: ReturnType<typeof new_defineEntries> = new_defineEntries({
  unstable_handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
  },
  unstable_getBuildConfig: async () => [
    { pathSpec: [], entries: [{ rscPath: '' }] },
  ],
});

export default entries;
