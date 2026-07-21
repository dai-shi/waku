import { AsyncLocalStorage } from 'node:async_hooks';
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec-registry.js';

export type Rerender = (rscPath: string, rscParams?: unknown) => void;

export type RouterStore = {
  req: Request;
  rscPath?: string;
  rscParams?: unknown;
  rerender?: Rerender;
  nonce?: string;
  resolveSearchCodec?: (
    routePath: string,
  ) => Unstable_SearchCodec<any> | undefined;
};

const routerStorage = new AsyncLocalStorage<RouterStore>();

export const runWithRouterStore = <T>(store: RouterStore, fn: () => T): T =>
  routerStorage.run(store, fn);

/**
 * Access the request being handled. Available during a render, an API route
 * handler, or a handler interceptor (request and build phases). Throws if called
 * outside that scope.
 */
export function getRequest(): Request {
  const store = routerStorage.getStore();
  if (!store) {
    throw new Error('Request is not available.');
  }
  return store.req;
}

export function getHeaders(): Readonly<Record<string, string>> {
  return Object.fromEntries(getRequest().headers.entries());
}

export const setRscPath = (rscPath: string) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rscPath = rscPath;
  }
};

export const setRscParams = (rscParams: unknown) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rscParams = rscParams;
  }
};

export function getRscPath(): string | undefined {
  return routerStorage.getStore()?.rscPath;
}

export function getRscParams(): unknown {
  return routerStorage.getStore()?.rscParams;
}

export const setRerender = (rerender: Rerender) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rerender = rerender;
  }
};

export const getRerender = (): Rerender => {
  const rerender = routerStorage.getStore()?.rerender;
  if (!rerender) {
    throw new Error('Rerender is not available.');
  }
  return rerender;
};

/**
 * Set the nonce applied to framework inline scripts for the current request.
 * Call this from a handler interceptor (e.g. bridging a Hono middleware's
 * generated nonce) before rendering.
 */
export function setNonce(nonce: string): void {
  const store = routerStorage.getStore();
  if (store) {
    store.nonce = nonce;
  }
}

export const getNonce = (): string | undefined =>
  routerStorage.getStore()?.nonce;

export const getResolveSearchCodec = ():
  ((routePath: string) => Unstable_SearchCodec<any> | undefined) | undefined =>
  routerStorage.getStore()?.resolveSearchCodec;
