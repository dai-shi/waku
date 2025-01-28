import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App, { atoms } from './components/app';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      let resolve: (a: unknown[]) => void;
      const atomsPromise = new Promise((r) => {
        resolve = r;
      });
      const atomValues = Array.isArray(input.rscParams) ? input.rscParams : [];
      const streamPromise = renderRsc({
        App: <App name={input.rscPath || 'Waku'} atomValues={atomValues} />,
        atomsPromise,
      });
      streamPromise.then(() => resolve(atoms)).catch(() => {});
      return streamPromise;
    }
    if (input.type === 'custom' && input.pathname === '/') {
      let resolve: (a: unknown[]) => void;
      const atomsPromise = new Promise((r) => {
        resolve = r;
      });
      const streamPromise = renderHtml(
        {
          App: <App name="Waku" atomValues={[]} />,
          // TODO avoid as never
          atomsPromise: atomsPromise as never,
        },
        <Slot id="App" />,
        {
          rscPath: '',
        },
      );
      streamPromise.then(() => resolve(atoms)).catch(() => {});
      return streamPromise;
    }
  },
  handleBuild: ({
    // renderRsc,
    // renderHtml,
    // rscPath2pathname,
    unstable_generatePrefetchCode,
  }) =>
    createAsyncIterable(async () => {
      const moduleIds = new Set<string>();
      const generateHtmlHead = () =>
        `<script type="module" async>${unstable_generatePrefetchCode(
          [''],
          moduleIds,
        )}</script>`;
      const tasks = [
        async () => ({
          type: 'htmlHead' as const,
          pathSpec: [],
          head: generateHtmlHead(),
        }),
        // async () => ({
        //   type: 'file' as const,
        //   pathname: rscPath2pathname(''),
        //   body: await renderRsc(
        //     { App: <App name="Waku" /> },
        //     { moduleIdCallback: (id) => moduleIds.add(id) },
        //   ),
        // }),
        // async () => ({
        //   type: 'file' as const,
        //   pathname: '/',
        //   body: renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        //     rscPath: '',
        //     htmlHead: generateHtmlHead(),
        //   }).then(({ body }) => body),
        // }),
      ];
      return tasks;
    }),
});
