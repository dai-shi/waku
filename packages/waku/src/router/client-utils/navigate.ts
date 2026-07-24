import {
  unstable_addBase as addBase,
  unstable_isImmutableElement as isImmutableElement,
  unstable_removeBase as removeBase,
} from '../../minimal/client.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  getRouteFromElements,
  getServerRedirect,
  isMetaKey,
} from './elements-meta.js';

// --- pure route and url helpers ---

export const pathnameToCurrentRoutePath = (pathname: string) =>
  pathnameToRoutePath(
    removeBase(pathname, import.meta.env.WAKU_CONFIG_BASE_PATH),
  );

export const parseRoute = (url: URL): RouteProps => {
  const { pathname, searchParams, hash } = url;
  return {
    path: pathnameToCurrentRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
};

export const getRouteUrl = (route: RouteProps): URL => {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = addBase(route.path, import.meta.env.WAKU_CONFIG_BASE_PATH);
  nextUrl.search = route.query;
  nextUrl.hash = route.hash;
  return nextUrl;
};

export const isSameRoute = (next: RouteProps, prev: RouteProps) =>
  next.path === prev.path &&
  next.query === prev.query &&
  next.hash === prev.hash;

export const parseRedirectUrl = (location: string, base: string | URL) => {
  const url = new URL(location, base);
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url
    : undefined;
};

// --- client-only navigation state, stored in the elements record ---

// The record's symbol key for the client-owned navigation state. The rendered
// path comes from the server's ROUTE_ID; NAV_ID carries what the server cannot
// know: the browser url, the pending history intent and the scroll intent.
export const NAV_ID = Symbol('waku-router-nav');

export type NavState = {
  url: string; // pathname + search + hash, with the base path
  attempted: readonly [path: string, query: string];
  push: boolean; // consumed by the reconciler on the first write
  scroll: { pathChanged: boolean } | null; // consumed by the reconciler
  scrollIntent?: boolean; // a failed attempt's intent, for a follow to inherit
};

export const getNavState = (
  elements: Record<string, unknown>,
): NavState | undefined =>
  (elements as Record<symbol, unknown>)[NAV_ID] as NavState | undefined;

export const makeNavState = (
  route: RouteProps,
  url: URL,
  options: { push: boolean; scroll: boolean; pathChanged: boolean },
): NavState => ({
  url: url.pathname + url.search + url.hash,
  attempted: [route.path, route.query],
  push: options.push,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
});

// Derive the committed route and browser url from the record. A server
// redirect (ROUTE_ID differing from the attempted route) moves both to the
// committed route, except the 404 route, which keeps the attempted url.
export const deriveCommitted = (
  elements: Record<string, unknown>,
  fallbackRoute: RouteProps,
): { route: RouteProps; nav: NavState | undefined; url: URL | undefined } => {
  const nav = getNavState(elements);
  const routeFromElements = getRouteFromElements(elements);
  if (!nav) {
    return { route: fallbackRoute, nav: undefined, url: undefined };
  }
  const navUrl = new URL(nav.url, window.location.href);
  const redirect = getServerRedirect(elements, {
    path: nav.attempted[0],
    query: nav.attempted[1],
    hash: '',
  });
  if (redirect && redirect.path !== '/404') {
    return { route: redirect, nav, url: getRouteUrl(redirect) };
  }
  return {
    route: {
      path: redirect
        ? redirect.path
        : routeFromElements
          ? routeFromElements.path
          : fallbackRoute.path,
      query: navUrl.searchParams.toString(),
      hash: navUrl.hash,
    },
    nav,
    url: navUrl,
  };
};

// --- instant navigation ---

export const canCommitInstantly = (
  routeSlotId: string,
  resolvedElements: Record<string, unknown>,
  prefetchedElements: Record<string, unknown> | null | undefined,
) =>
  isImmutableElement(resolvedElements, routeSlotId) ||
  !!(prefetchedElements && isImmutableElement(prefetchedElements, routeSlotId));

export const pinForSwr =
  (getResolvedElements: () => Record<string, unknown>) => (key: string) =>
    isMetaKey(key) || isImmutableElement(getResolvedElements(), key);
