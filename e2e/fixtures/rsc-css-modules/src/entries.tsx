import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';

import App from './components/App.js';
import { FUNCTION_RESULT } from 'waku/config';

const entries: ReturnType<typeof defineEntries> = defineEntries({
  handleRequest: async (input, { renderRsc }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ [FUNCTION_RESULT]: value });
    }
  },
  handleBuild: () => null,
});

export default entries;
