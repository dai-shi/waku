import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';

import App from './components/App';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({ App: <App name={input.rscPath || 'Waku'} /> });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: ({
    // renderRsc,
    // renderHtml,
    // rscPath2pathname,
    unstable_generatePrefetchCode,
  }) => ({
    [Symbol.asyncIterator]: () => {
      const code = unstable_generatePrefetchCode([''], []);
      const tasks = [
        async () => ({
          type: 'htmlHead' as const,
          pathSpec: [],
          head: `<script type="module" async>${code}</script>`,
        }),
        // async () => ({
        //   type: 'file' as const,
        //   pathname: rscPath2pathname(''),
        //   body: await renderRsc({ App: <App name="Waku" /> }),
        // }),
        // async () => ({
        //   type: 'file' as const,
        //   pathname: '/',
        //   body: (
        //     await renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        //       rscPath: '',
        //       htmlHead: `<script type="module" async>${code}</script>`,
        //     })
        //   ).body,
        // }),
      ];
      return {
        next: async () => {
          const task = tasks.shift();
          if (task) {
            return { value: await task() };
          }
          return { done: true, value: undefined };
        },
      };
    },
  }),
});
