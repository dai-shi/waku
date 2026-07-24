import {
  unstable_addBase as addBase,
  unstable_getErrorInfo as getErrorInfo,
  unstable_isImmutableElement as isImmutableElement,
  unstable_removeBase as removeBase,
} from '../../minimal/client.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { isMetaKey } from './elements-meta.js';

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

const parseRedirectUrl = (location: string, base: string | URL) => {
  const url = new URL(location, base);
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url
    : undefined;
};

const MAX_ERROR_HOPS = 20;

// --- the resolver ---

export type Destination = {
  route: RouteProps;
  routeUrl: URL;
  elements?: Record<string, unknown> | undefined;
};

export type ResolveDeps = {
  fetchRoute: (
    route: RouteProps,
    routeUrl: URL,
  ) => Promise<Record<string, unknown>>;
  isKnownStatic: (path: string) => boolean;
  has404: boolean;
  isAborted: () => boolean;
  leaveApp: (url: URL) => void;
};

export const resolveFollowingErrors = async (
  deps: ResolveDeps,
  route: RouteProps,
  routeUrl: URL,
  routeBefore: RouteProps,
  errorToFollow: unknown,
): Promise<Destination | undefined> => {
  for (let hops = errorToFollow ? 1 : 0; hops <= MAX_ERROR_HOPS; hops++) {
    if (errorToFollow) {
      const info = getErrorInfo(errorToFollow);
      const redirectUrl = info?.location
        ? parseRedirectUrl(info.location, routeUrl)
        : undefined;
      if (redirectUrl) {
        if (redirectUrl.origin !== window.location.origin) {
          deps.leaveApp(redirectUrl);
          return undefined;
        }
        route = parseRoute(redirectUrl);
        routeUrl = redirectUrl;
      } else if (info?.status === 404 && deps.has404 && route.path !== '/404') {
        route = parseRoute(new URL('/404', window.location.href));
      } else {
        throw errorToFollow;
      }
      errorToFollow = undefined;
    }
    if (
      hops > 0 &&
      (deps.isKnownStatic(route.path) || isSameRoute(route, routeBefore))
    ) {
      return { route, routeUrl };
    }
    try {
      return {
        route,
        routeUrl,
        elements: await deps.fetchRoute(route, routeUrl),
      };
    } catch (e) {
      if (deps.isAborted()) {
        throw e;
      }
      errorToFollow = e;
    }
  }
  throw new Error('too many redirect or 404 follows', {
    cause: errorToFollow,
  });
};

// --- history, scroll ---

export const writeUrlToHistory = (mode: 'push' | 'replace', url: URL) => {
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url);
  } else {
    window.history.replaceState(window.history.state, '', url);
  }
};

// --- client-only navigation state ---

// The route path is derived from the elements' ROUTE_ID. The query and hash are
// kept here because they are client-owned: a static route does not echo the URL
// query, and the server never sees the hash.
export type Nav = {
  query: string;
  hash: string;
  history: { mode: 'push' | 'replace'; url: URL | undefined } | null;
  scroll: { pathChanged: boolean } | null;
};

export const deriveNav = (outcome: {
  destination: Destination;
  attempted: RouteProps;
  routeBefore: RouteProps;
  history: 'push' | 'replace' | undefined;
  historyUrl: URL | undefined;
  shouldScroll: boolean;
  getServerRedirect: (
    elements: Record<string, unknown>,
    route: RouteProps,
  ) => RouteProps | undefined;
}): { route: RouteProps; nav: Nav } => {
  const { destination, attempted, routeBefore } = outcome;
  const followed = !isSameRoute(destination.route, attempted);
  const redirect =
    destination.elements &&
    outcome.getServerRedirect(destination.elements, destination.route);
  const route = redirect || destination.route;
  const mode = redirect?.path === '/404' ? undefined : outcome.history;
  const url = redirect
    ? undefined
    : followed
      ? destination.routeUrl
      : outcome.historyUrl;
  return {
    route,
    nav: {
      query: route.query,
      hash: route.hash,
      history: mode ? { mode, url } : null,
      scroll: outcome.shouldScroll
        ? { pathChanged: route.path !== routeBefore.path }
        : null,
    },
  };
};

export const applyServerRedirect = (prev: Nav, redirect: RouteProps): Nav => ({
  ...prev,
  query: redirect.query,
  hash: redirect.hash,
  history:
    redirect.path === '/404'
      ? null
      : { mode: 'replace', url: getRouteUrl(redirect) },
});

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
