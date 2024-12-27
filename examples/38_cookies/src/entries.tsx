import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fsPromises from 'node:fs/promises';
import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { getContextData } from 'waku/middleware/context';

import App from './components/App';

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    const data = getContextData() as { count?: number };
    data.count = (data.count || 0) + 1;
    const items = JSON.parse(
      await fsPromises.readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '../private/items.json',
        ),
        'utf8',
      ),
    );
    if (input.type === 'component') {
      return renderRsc({
        App: <App name={input.rscPath || 'Waku'} items={items} />,
      });
    }
    if (input.type === 'custom' && input.pathname === '/') {
      return renderHtml(
        { App: <App name={'Waku'} items={items} /> },
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
  }) => ({
    [Symbol.asyncIterator]: () => {
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
        //   body: (
        //     await renderHtml({ App: <App name="Waku" /> }, <Slot id="App" />, {
        //       rscPath: '',
        //       htmlHead: generateHtmlHead(),
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
