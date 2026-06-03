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

// The minimal API hands the request to handleRequest, but not to deeply nested
// server functions. Bring your own AsyncLocalStorage to make it available.
const requestStore = new AsyncLocalStorage<Request>();

export const runWithRequest = <T>(req: Request, fn: () => T): T => {
  return requestStore.run(req, fn);
};

export const getRequest = (): Request => {
  const req = requestStore.getStore();
  if (!req) {
    throw new Error('Request is not available.');
  }
  return req;
};
