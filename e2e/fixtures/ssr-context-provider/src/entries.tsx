import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/app.js';
import { FUNCTION_RESULT } from 'waku/config';

const entries: ReturnType<typeof defineEntries> = defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App /> });
    }
    if (input.type === 'function') {
      const value = await input.fn(...input.args);
      return renderRsc({ [FUNCTION_RESULT]: value });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App /> }, <Slot id="App" />, { rscPath: '' });
    }
  },
  handleBuild: () =>
    createAsyncIterable(async () => {
      const tasks = [
        async () => ({
          type: 'htmlHead' as const,
          pathSpec: [],
        }),
      ];
      return tasks;
    }),
});

export default entries;
