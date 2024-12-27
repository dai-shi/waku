import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/app.js';

const entries: ReturnType<typeof defineEntries> = defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ _value: value });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App /> }, <Slot id="App" />, { rscPath: '' });
    }
  },
  handleBuild: () => null,
});

export default entries;
