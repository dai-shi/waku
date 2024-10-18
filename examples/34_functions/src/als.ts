import { AsyncLocalStorage } from 'node:async_hooks';

type Rerender = (rscPath: string) => void;

const store = new AsyncLocalStorage<Rerender>();

export const runWithRerender = <T>(rerender: Rerender, fn: () => T): T => {
  return store.run(rerender, fn);
};

export const rerender = (rscPath: string) => {
  const fn = store.getStore();
  if (fn) {
    fn(rscPath);
  }
};
