import {
  getRouteFromElements,
  isStaticFromElements,
} from '../client-core-utils/element-meta.js';
import { getRouteUrl } from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

// the client owned router state; the server's ROUTE_ID owns the path
export const ROUTER_STATE_ID = Symbol('waku-router-state');

// merges carry this object by reference; the reconciler keys off its identity
export type RouterState = {
  readonly url: string; // pathname + search + hash, with the base path
  readonly requested: readonly [path: string, query: string];
  readonly history: 'push' | 'replace' | null;
  readonly scroll: { readonly pathChanged: boolean } | null;
  readonly follows: number;
  readonly failedFrom?: RouteProps;
};

export const getRouterState = (
  elements: Record<string | symbol, unknown>,
): RouterState | undefined =>
  elements[ROUTER_STATE_ID] as RouterState | undefined;

export const makeRouterState = (
  route: RouteProps,
  url: URL,
  options: {
    history: 'push' | 'replace' | null;
    scroll: boolean;
    pathChanged: boolean;
    follows: number;
  },
): RouterState => ({
  url: url.pathname + url.search + url.hash,
  requested: [route.path, route.query],
  history: options.history,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
  follows: options.follows,
});

export const resolveServerRedirect = (
  elements: Record<string | symbol, unknown>,
  routerState: RouterState,
  fallbackPath: string,
): { route: RouteProps; url: URL } => {
  const stateUrl = new URL(routerState.url, window.location.href);
  if (routerState.failedFrom) {
    return {
      route: {
        path: routerState.requested[0],
        query: stateUrl.searchParams.toString(),
        hash: stateUrl.hash,
      },
      url: stateUrl,
    };
  }
  const serverRoute = getRouteFromElements(elements);
  const redirect =
    serverRoute &&
    (serverRoute.path !== routerState.requested[0] ||
      (!isStaticFromElements(elements) &&
        serverRoute.query !== routerState.requested[1]))
      ? serverRoute
      : undefined;
  if (redirect && redirect.path !== '/404') {
    return { route: redirect, url: getRouteUrl(redirect) };
  }
  return {
    route: {
      path: redirect?.path ?? serverRoute?.path ?? fallbackPath,
      query: stateUrl.searchParams.toString(),
      hash: stateUrl.hash,
    },
    url: stateUrl,
  };
};

export const getSettledRoute = (
  elements: Record<string | symbol, unknown>,
  fallback: RouteProps,
): RouteProps => {
  const routerState = getRouterState(elements);
  if (!routerState) {
    return fallback;
  }
  return (
    routerState.failedFrom ??
    resolveServerRedirect(elements, routerState, fallback.path).route
  );
};
