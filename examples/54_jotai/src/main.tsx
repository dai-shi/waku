import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot, fetchRsc } from 'waku/minimal/client';
import { atom, getDefaultStore } from 'jotai/vanilla';
import type { Atom } from 'jotai/vanilla';

// TODO there should be a better way than copying functions from minimal/client.
type FetchCache = NonNullable<Parameters<typeof fetchRsc>[2]>;
type Elements = Promise<Record<string, ReactNode>>;
const getCached = <T,>(c: () => T, m: WeakMap<object, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;
const cache1 = new WeakMap();
const mergeElements = (a: Elements, b: Elements): Elements => {
  const getResult = () => {
    const promise: Elements = new Promise((resolve, reject) => {
      Promise.all([a, b])
        .then(([a, b]) => {
          const nextElements = { ...a, ...b };
          delete nextElements._value;
          resolve(nextElements);
        })
        .catch((e) => reject(e));
    });
    return promise;
  };
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};
const ENTRY = 'e';
const SET_ELEMENTS = 's';
const myFetchCache: FetchCache = {};
const refetch = (rscPath: string, rscParams?: unknown) => {
  // clear cache entry before fetching
  delete myFetchCache[ENTRY];
  const data = fetchRsc(rscPath, rscParams, myFetchCache);
  myFetchCache[SET_ELEMENTS]?.((prev) => mergeElements(prev, data));
};

let unsubscribe: (() => void) | undefined;

const unstable_enhanceCreateData =
  (
    createData: (
      responsePromise: Promise<Response>,
    ) => Promise<Record<string, ReactNode>>,
  ) =>
  async (responsePromise: Promise<Response>) => {
    const data = createData(responsePromise);
    Promise.resolve(data)
      .then(async (data) => {
        if (
          data &&
          typeof data === 'object' &&
          'atomsPromise' in data &&
          data.atomsPromise instanceof Promise
        ) {
          const atoms = (await data.atomsPromise) as unknown as Atom<unknown>[];
          const watchAtom = atom((get) => {
            const atomValues: unknown[] = [];
            atoms.forEach((atom) => {
              atomValues.push(get(atom));
            });
            return atomValues;
          });
          const store = getDefaultStore();
          unsubscribe?.();
          unsubscribe = store.sub(watchAtom, () => {
            // TODO rscPath==='' is hardcoded
            refetch('', store.get(watchAtom));
          });
        }
      })
      .catch(() => {});
    return data;
  };

const rootElement = (
  <StrictMode>
    <Root
      fetchCache={myFetchCache}
      unstable_enhanceCreateData={unstable_enhanceCreateData}
    >
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
