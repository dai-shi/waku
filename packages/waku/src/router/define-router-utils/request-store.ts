import { AsyncLocalStorage } from 'node:async_hooks';

export type HandlerInterceptor = <T>(next: () => Promise<T>) => Promise<T>;

export type Rerender = (rscPath?: string, rscParams?: unknown) => void;

export type RouterStore = {
  req: Request;
  rscPath?: string;
  rscParams?: unknown;
  rerender?: Rerender;
  nonce?: string;
};

const routerStorage = new AsyncLocalStorage<RouterStore>();

export const runWithRouterStore = <T>(store: RouterStore, fn: () => T): T =>
  routerStorage.run(store, fn);

/**
 * Access the request being handled. Available while the router handles a
 * request or builds a page: in a render, a server function, an API route
 * handler, a handler interceptor, or `unstable_defineRouter`'s `resolve`.
 * Throws if called outside that scope, such as at module scope.
 *
 * `url` is the URL the request was sent to, which is Waku's RSC URL after a
 * client navigation, so read the route with `unstable_parseRouterRequest`. A
 * server function called from the client gets a request that identifies no
 * route, so pass it any route data it needs as arguments. Inside an API route
 * handler, the handler's own `req` has its pathname relative to the base path
 * and shares this request's body, so read the body from it. A static render
 * runs at build time against a synthetic request, so read request data only in
 * dynamic renders.
 *
 * @example
 * import { getRequest } from 'waku/router/server';
 *
 * const Country = () => {
 *   const country = getRequest().headers.get('cf-ipcountry') ?? 'unknown';
 *   return <p>{country}</p>;
 * };
 */
export function getRequest(): Request {
  const store = routerStorage.getStore();
  if (!store) {
    throw new Error('Request is not available.');
  }
  return store.req;
}

/** @deprecated Use `getRequest().headers`, e.g. `getRequest().headers.get('cookie')`. */
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
