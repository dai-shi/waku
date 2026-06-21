import { Suspense } from 'react';
import { atom } from 'jotai/vanilla';
import { Provider, getStore } from 'waku-jotai/minimal';
import { JotaiCounter, countAtom } from './JotaiCounter';

const doubleCountAtom = atom(async (get) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return get(countAtom) * 2;
});

async function JotaiContent() {
  const store = await getStore();
  const doubleCount = store.get(doubleCountAtom);
  return (
    <section>
      <JotaiCounter />
      <p data-testid="double-count">Double count: {doubleCount}</p>
    </section>
  );
}

export function JotaiApp({ rscParams }: { rscParams: unknown }) {
  return (
    <Provider rscPath="jotai" rscParams={rscParams}>
      <Suspense fallback="Loading...">
        <JotaiContent />
      </Suspense>
    </Provider>
  );
}
