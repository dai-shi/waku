import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';

import App from './components/App';
import Dynamic from './components/Dynamic';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    if (input.type === 'component') {
      if (input.rscPath === '') {
        return renderRsc({
          App: <App name={input.rscPath || 'Waku'} />,
        });
      }
      if (input.rscPath === 'dynamic') {
        return renderRsc({
          Dynamic: (
            <Dynamic>
              <Children />
            </Dynamic>
          ),
        });
      }
      throw new Error('Unexpected rscPath: ' + input.rscPath);
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        rscPath: '',
      });
    }
  },
  handleBuild: ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    unstable_generatePrefetchCode,
  }) =>
    createAsyncIterable(async () => {
      const moduleIds = new Set<string>();
      const generateHtmlHead = () =>
        `<script type="module" async>${unstable_generatePrefetchCode(
          ['dynamic'],
          moduleIds,
        )}</script>`;
      const tasks = [
        async () => ({
          type: 'file' as const,
          pathname: rscPath2pathname(''),
          body: renderRsc(
            { App: <App name="Waku" /> },
            { moduleIdCallback: (id) => moduleIds.add(id) },
          ),
        }),
        async () => ({
          type: 'file' as const,
          pathname: '/',
          body: renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
            rscPath: '',
            htmlHead: generateHtmlHead(),
          }).then(({ body }) => body),
        }),
      ];
      return tasks;
    }),
});
