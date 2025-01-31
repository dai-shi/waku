import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { Slot } from 'waku/minimal/client';
import { unstable_createAsyncIterable as createAsyncIterable } from 'waku/server';
import type { Atom } from 'jotai/vanilla';

import App from './components/app';

const CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');

export default defineEntries({
  handleRequest: async (input, { renderRsc, renderHtml }) => {
    // TODO Can we use actual jotai store? (w/ INTERNAL_buildStore)
    // FIXME This doesn't work well with HMR.
    const store = {
      atoms: new Map<Atom<unknown>, string>(),
      values: new Map<string, unknown>(),
      get: <Value,>(a: Atom<Value>) => {
        if ((a as any)['$$typeof'] === CLIENT_REFERENCE_TAG) {
          const id: string = (a as any)['$$id'];
          store.atoms.set(a, id);
          if (store.values.has(id)) {
            return store.values.get(id) as Value;
          }
        }
        if (!('init' in a)) {
          throw new Error('Only primitive atoms are supported.');
        }
        return a.init as Value;
      },
    };
    if (input.type === 'component') {
      let resolve: (m: Map<Atom<unknown>, string>) => void;
      const atomsPromise = new Promise((r) => {
        resolve = r;
      });
      if (input.rscParams instanceof Map) {
        store.values = input.rscParams;
      }
      const streamPromise = renderRsc({
        App: <App name={input.rscPath || 'Waku'} store={store} />,
        atomsPromise,
      });
      // FIXME It may resolve too early?
      streamPromise.then(() => resolve(store.atoms)).catch(() => {});
      return streamPromise;
    }
    if (input.type === 'custom' && input.pathname === '/') {
      let resolve: (m: Map<Atom<unknown>, string>) => void;
      const atomsPromise = new Promise((r) => {
        resolve = r;
      });
      const streamPromise = renderHtml(
        {
          App: <App name="Waku" store={store} />,
          atomsPromise,
        },
        <Slot id="App" />,
        {
          rscPath: '',
        },
      );
      streamPromise.then(() => resolve(store.atoms)).catch(() => {});
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
