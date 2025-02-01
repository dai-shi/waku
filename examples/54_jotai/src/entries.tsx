import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/app';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      return renderRsc({
        App: <App name={input.rscPath || 'Waku'} rscParams={input.rscParams} />,
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name="Waku" rscParams={undefined} /> },
        <Slot id="App" />,
        { rscPath: '' },
      );
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
