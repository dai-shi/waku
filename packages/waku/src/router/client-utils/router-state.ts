import { unstable_isImmutableElement as isImmutableElement } from '../../minimal/client.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  getRouteFromElements,
  getServerRedirect,
  isMetaKey,
} from './elements-meta.js';
import { getRouteUrl } from './route-url.js';

// the client owned router state; the server's ROUTE_ID owns the path
export const ROUTER_STATE_ID = Symbol('waku-router-state');

// merges carry this object by reference; the reconciler keys off its identity
export type RouterState = {
  readonly url: string; // pathname + search + hash, with the base path
  readonly attempted: readonly [path: string, query: string];
  // null leaves history alone: the browser already wrote it
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
  attempted: [route.path, route.query],
  history: options.history,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
  followCount: options.followCount,
});

// a redirect to the 404 route keeps the url that was attempted
export const resolveServerRedirect = (
  elements: Record<string | symbol, unknown>,
  routerState: RouterState,
  fallbackPath: string,
): { route: RouteProps; url: URL } => {
  const stateUrl = new URL(routerState.url, window.location.href);
  // nothing landed on a failed navigation, so there is no redirect to read
  const redirect = routerState.failure
    ? undefined
    : getServerRedirect(elements, {
        path: routerState.attempted[0],
        query: routerState.attempted[1],
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
