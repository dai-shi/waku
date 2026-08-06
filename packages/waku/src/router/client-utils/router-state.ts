import { unstable_isImmutableElement as isImmutableElement } from '../../minimal/client.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { getRouteUrl } from './route-url.js';

// Server-owned element meta (ROUTE / HAS404 / IS_STATIC), read by the client.
export const getRouteFromElements = (
  elements: Record<string, unknown>,
): RouteProps | undefined => {
  const routeData = elements[ROUTE_ID] as [string, string] | undefined;
  return routeData
    ? { path: routeData[0], query: routeData[1], hash: '' }
    : undefined;
};

export const isStaticFromElements = (elements: Record<string, unknown>) =>
  !!elements[IS_STATIC_ID];

export const has404FromElements = (elements: Record<string, unknown>) =>
  !!elements[HAS404_ID];

export const isMetaKey = (key: string) =>
  key === ROUTE_ID || key === HAS404_ID || key === IS_STATIC_ID;

export const getServerRedirect = (
  elements: Record<string, unknown>,
  route: RouteProps,
): RouteProps | undefined => {
  const serverRoute = getRouteFromElements(elements);
  if (
    serverRoute &&
    (serverRoute.path !== route.path ||
      (!isStaticFromElements(elements) && serverRoute.query !== route.query))
  ) {
    return serverRoute;
  }
  return undefined;
};

// the client owned router state; the server's ROUTE_ID owns the path
export const ROUTER_STATE_ID = Symbol('waku-router-state');

// merges carry this object by reference; the reconciler keys off its identity
export type RouterState = {
  readonly url: string; // pathname + search + hash, with the base path
  readonly requested: readonly [path: string, query: string];
  readonly history: 'push' | 'replace' | null;
  readonly scroll: { readonly pathChanged: boolean } | null;
  readonly followCount: number;
  // set when the fetch never landed, so the route id is stale
  readonly failure?: {
    readonly error: unknown;
    readonly committedHash: string;
  };
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
    followCount: number;
  },
): RouterState => ({
  url: url.pathname + url.search + url.hash,
  requested: [route.path, route.query],
  history: options.history,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
  followCount: options.followCount,
});

export const resolveServerRedirect = (
  elements: Record<string | symbol, unknown>,
  routerState: RouterState,
  fallbackPath: string,
): { route: RouteProps; url: URL } => {
  const stateUrl = new URL(routerState.url, window.location.href);
  const redirect = routerState.failure
    ? undefined
    : getServerRedirect(elements, {
        path: routerState.requested[0],
        query: routerState.requested[1],
        hash: '',
      });
  if (redirect && redirect.path !== '/404') {
    return { route: redirect, url: getRouteUrl(redirect) };
  }
  return {
    route: {
      path:
        redirect?.path ?? getRouteFromElements(elements)?.path ?? fallbackPath,
      query: stateUrl.searchParams.toString(),
      hash: stateUrl.hash,
    },
    url: stateUrl,
  };
};

/**
 * A failed navigation keeps the hash still on screen, unlike the route the
 * router paints, which takes its hash from the requested url.
 */
export const getSettledRoute = (
  elements: Record<string | symbol, unknown>,
  fallback: RouteProps,
): RouteProps => {
  const routerState = getRouterState(elements);
  if (!routerState) {
    return fallback;
  }
  if (routerState.failure) {
    return {
      ...(getRouteFromElements(elements) ?? fallback),
      hash: routerState.failure.committedHash,
    };
  }
  return resolveServerRedirect(elements, routerState, fallback.path).route;
};

export const canCommitInstantly = (
  routeSlotId: string,
  resolvedElements: Record<string, unknown>,
  prefetchedElements: Record<string, unknown> | null | undefined,
) =>
  isImmutableElement(resolvedElements, routeSlotId) ||
  !!(prefetchedElements && isImmutableElement(prefetchedElements, routeSlotId));

// symbol keys are client owned; they are carried, never fetched
export const pinForSwr =
  (getResolvedElements: () => Record<string, unknown>) =>
  (key: string | symbol) =>
    typeof key === 'symbol' ||
    isMetaKey(key) ||
    isImmutableElement(getResolvedElements(), key);
