'use client';

import { use, useCallback, useContext, useMemo } from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_addBase as addBase,
  unstable_getErrorInfo as getErrorInfo,
  unstable_removeBase as removeBase,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from '../minimal/client.js';
import type { PrefetchOptions } from './client-core-utils/caches.js';
import { RouterHostContext } from './client-core-utils/host.js';
import type { RouterHost } from './client-core-utils/host.js';
import { useInitialRscParams } from './client-core-utils/initial-route.js';
import {
  SearchCodecsProvider_UNSTABLE,
  useResolveSearchCodec,
} from './client-core-utils/route-hooks.js';
import { parseRoute } from './client-core-utils/route-url.js';
import type { SliceId } from './client-core-utils/slice.js';
import {
  prefetchRouteUnlessReusable,
  preloadRouteModules,
  resolveRouteHref,
} from './client-utils/link.js';
import { useNavigation } from './client-utils/navigation.js';
import { RenderErrorHandler } from './client-utils/render-error.js';
import {
  RouterContext,
  dispatchChangeRoute,
} from './client-utils/router-context.js';
import type { ChangeRoute } from './client-utils/router-context.js';
import { shouldScrollByDefault } from './client-utils/scroll.js';
import type {
  RouteParams,
  RouteSearch,
} from './create-pages-utils/inferred-path-types.js';
import { buildRouteHref } from './isomorphic-utils/build-route-href.js';
import type {
  BuildRouteHrefTarget,
  RouteHref,
  RoutePath,
} from './isomorphic-utils/build-route-href.js';
import { matchRouteParams } from './isomorphic-utils/match-route-params.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
  getRouteSlotId,
  getSliceSlotId,
} from './isomorphic-utils/route-path.js';
import type { RouteProps } from './isomorphic-utils/route-path.js';

export { ErrorBoundary } from './client-core-utils/error-boundary.js';
export {
  SearchCodecsProvider_UNSTABLE,
  useParams_UNSTABLE,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from './client-core-utils/route-hooks.js';
export { Slice } from './client-core-utils/slice.js';
export { Link, useNavigationStatus_UNSTABLE } from './client-utils/link.js';
export type { LinkProps } from './client-utils/link.js';

type NavigateOptions = {
  /**
   * Whether the link should scroll on navigation.
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change (not on query-only change)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its `<Suspense>` fallbacks right
   * away and stream the dynamic parts in, instead of waiting for the response.
   */
  unstable_instant?: boolean;
};

/**
 * Resolves once the requested navigation has been handled: after its response
 * when the route needs one, right away when it does not, and when a newer
 * navigation supersedes it. Rejects when the navigation fails, when a redirect
 * hands the page to the browser, and when no custom 404 route can answer a
 * missing route. A redirect or 404 received while fetching is followed before
 * this resolves. It does not wait for React to render, so the address bar may
 * still show the previous URL.
 */
type Navigate = {
  (to: RouteHref, options?: NavigateOptions): Promise<void>;
  <Path extends RoutePath>(
    target: BuildRouteHrefTarget<Path>,
    options?: NavigateOptions,
  ): Promise<void>;
};

/**
 * Fetches whatever it is given, including the route already on screen, so it
 * can warm the cache for a later reload. `<Link>` prefetching is automatic and
 * skips a target the router is already showing.
 */
type Prefetch = {
  (to: RouteHref, options?: PrefetchOptions): void;
  <Path extends RoutePath>(
    target: BuildRouteHrefTarget<Path>,
    options?: PrefetchOptions,
  ): void;
};

type PrefetchRoute = (route: RouteProps, options?: PrefetchOptions) => void;

const useRouterOrThrow = () => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  return router;
};

/**
 * Current route fields plus navigation helpers (`push`, `replace`, `reload`,
 * `back`, `forward`, `prefetch`).
 *
 * `push` / `replace` settle as described on their return type: handled
 * navigation, not paint-finished. `reload` refetches the current location.
 * `prefetch` warms a route for a later navigation or reload; `<Link>`
 * prefetching is automatic and skips the route already on screen.
 */
export function useRouter() {
  const router = useRouterOrThrow();
  const { route, changeRoute, getElements } = router;
  const resolveCodec = useResolveSearchCodec();
  const navigate = useCallback(
    (
      history: 'push' | 'replace',
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const url = new URL(
        resolveRouteHref(to, resolveCodec),
        window.location.href,
      );
      return dispatchChangeRoute(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        history,
        url,
        instant: options?.unstable_instant,
      });
    },
    [changeRoute, resolveCodec],
  );
  const push = useCallback(
    (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => navigate('push', to, options),
    [navigate],
  ) as Navigate;
  const replace = useCallback(
    (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => navigate('replace', to, options),
    [navigate],
  ) as Navigate;
  const reload = useCallback(async () => {
    const url = new URL(window.location.href);
    await dispatchChangeRoute(changeRoute, parseRoute(url), {
      shouldScroll: true,
      refetch: true,
      history: 'replace',
      url, // reloading moves nothing
    });
  }, [changeRoute]);
  const back = useCallback(() => {
    window.history.back();
  }, []);
  const forward = useCallback(() => {
    window.history.forward();
  }, []);
  const prefetch = useCallback(
    (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: PrefetchOptions,
    ) => {
      const url = new URL(
        resolveRouteHref(to, resolveCodec),
        window.location.href,
      );
      const next = parseRoute(url);
      preloadRouteModules(next.path);
      prefetchRouteUnlessReusable(next, options, getElements);
    },
    [resolveCodec, getElements],
  ) as Prefetch;
  return {
    ...route,
    push,
    replace,
    reload,
    back,
    forward,
    prefetch,
  };
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

const InnerRouter = ({
  fallbackRoute,
  routeInterceptor,
}: {
  fallbackRoute: RouteProps;
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined;
}) => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const {
    route: currentRoute,
    changeRoute,
    getElements,
    error: navigationError,
  } = useNavigation(elements, fallbackRoute, routeInterceptor);

  const navigate = useCallback<RouterHost['navigate']>(
    (href, opts) => {
      const url = new URL(href, window.location.href);
      return dispatchChangeRoute(changeRoute, parseRoute(url), {
        shouldScroll: opts.scroll ?? shouldScrollByDefault(url),
        history: opts.history,
        url,
      });
    },
    [changeRoute],
  );
  const host = useMemo(
    (): RouterHost => ({ route: currentRoute, navigate }),
    [currentRoute, navigate],
  );

  const routeElement = navigationError ? (
    <ThrowError error={navigationError.error} />
  ) : (
    <Slot id={getRouteSlotId(currentRoute.path)} />
  );
  // TODO a followable error thrown by the root layout, or by an action it
  // calls, is not followed. The layout's own ErrorBoundary catches it first,
  // so wrapping this slot in another handler does not reach it
  const rootElement = (
    <Slot id="root">
      <RenderErrorHandler>{routeElement}</RenderErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route: currentRoute,
        changeRoute,
        getElements,
      }}
    >
      <RouterHostContext value={host}>{rootElement}</RouterHostContext>
    </RouterContext>
  );
};

/**
 * Client router root. Each instance provides navigation state to its
 * descendants. Instances can start from different `initialRoute` values, but
 * navigation uses the document's shared URL and history. Server action
 * requests use the most recently mounted Minimal Root. `initialRoute` defaults
 * to the current browser location.
 */
export function Router({
  initialRoute = parseRoute(new URL(window.location.href)),
  unstable_routeInterceptor,
}: {
  initialRoute?: RouteProps;
  /**
   * Intercepts browser history navigation (back/forward) before it commits;
   * programmatic navigation and `Link` clicks are not intercepted. Return
   * `false` to ignore the pop (the address bar has already moved); otherwise
   * return the route to render.
   */
  unstable_routeInterceptor?: (route: RouteProps) => RouteProps | false;
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = useInitialRscParams(
    initialRscPath,
    initialRoute.query,
  );
  return (
    <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
      <InnerRouter
        fallbackRoute={initialRoute}
        routeInterceptor={unstable_routeInterceptor}
      />
    </Root>
  );
}

export function INTERNAL_ServerRouter({ route }: { route: RouteProps }) {
  const routeElement = <Slot id={getRouteSlotId(route.path)} />;
  const rootElement = <Slot id="root">{routeElement}</Slot>;
  return (
    <RouterContext
      value={{
        route,
        changeRoute: notAvailableInServer('changeRoute'),
      }}
    >
      <RouterHostContext
        value={{
          route,
          navigate: notAvailableInServer('navigate'),
        }}
      >
        {rootElement}
      </RouterHostContext>
    </RouterContext>
  );
}

/** @deprecated Use `SearchCodecsProvider_UNSTABLE`. */
export const Unstable_SearchCodecsProvider = SearchCodecsProvider_UNSTABLE;
/** @deprecated Import `Unstable_RouteProps` from `waku/router/client-core`. */
export type Unstable_RouteProps = RouteProps;
/** @deprecated Import `unstable_HAS404_ID` from `waku/router/client-core`. */
export const unstable_HAS404_ID = HAS404_ID;
/** @deprecated Import `unstable_IS_STATIC_ID` from `waku/router/client-core`. */
export const unstable_IS_STATIC_ID = IS_STATIC_ID;
/** @deprecated Import `unstable_ROUTE_ID` from `waku/router/client-core`. */
export const unstable_ROUTE_ID = ROUTE_ID;
/** @deprecated Import `unstable_encodeRoutePath` from `waku/router/client-core`. */
export const unstable_encodeRoutePath = encodeRoutePath;
/** @deprecated Import `unstable_encodeSliceId` from `waku/router/client-core`. */
export const unstable_encodeSliceId = encodeSliceId;
/** @deprecated Import `unstable_getRouteSlotId` from `waku/router/client-core`. */
export const unstable_getRouteSlotId = getRouteSlotId;
/** @deprecated Import `unstable_getSliceSlotId` from `waku/router/client-core`. */
export const unstable_getSliceSlotId = getSliceSlotId;
/** @deprecated Import `unstable_getErrorInfo` from `waku/minimal/client`. */
export const unstable_getErrorInfo = getErrorInfo;
/** @deprecated Import `unstable_addBase` from `waku/minimal/client`. */
export const unstable_addBase = addBase;
/** @deprecated Import `unstable_removeBase` from `waku/minimal/client`. */
export const unstable_removeBase = removeBase;
/** @deprecated History-binding private; not on `waku/router/client-core`. */
export const unstable_RouterContext = RouterContext;
/** @deprecated History-binding private; not on `waku/router/client-core`. */
export type Unstable_ChangeRoute = ChangeRoute;
/** @deprecated Import `unstable_prefetchRoute` from `waku/router/client-core`. */
export type Unstable_PrefetchRoute = PrefetchRoute;
/** @deprecated Import `Unstable_PrefetchOptions` from `waku/router/client-core`. */
export type Unstable_PrefetchOptions = PrefetchOptions;
/** @deprecated Import `Unstable_SliceId` from `waku/router/client-core`. */
export type Unstable_SliceId = SliceId;
/** @deprecated Import `Unstable_RouteHref` from `waku/router/client-core`. */
export type Unstable_RouteHref = RouteHref;
/** @deprecated Import `Unstable_RoutePath` from `waku/router/client-core`. */
export type Unstable_RoutePath = RoutePath;
/** @deprecated Import `Unstable_BuildRouteHrefTarget` from `waku/router/client-core`. */
export type Unstable_BuildRouteHrefTarget<Path extends RoutePath> =
  BuildRouteHrefTarget<Path>;
/** @deprecated Import `Unstable_RouteParams` from `waku/router/client-core`. */
export type Unstable_RouteParams<Path extends RoutePath> = RouteParams<Path>;
/** @deprecated Import `Unstable_RouteSearch` from `waku/router/client-core`. */
export type Unstable_RouteSearch<Path extends RoutePath> = RouteSearch<Path>;
/** @deprecated Import `unstable_buildRouteHref` from `waku/router/client-core`. */
export const unstable_buildRouteHref = buildRouteHref;
/** @deprecated Import `unstable_matchRouteParams` from `waku/router/client-core`. */
export const unstable_matchRouteParams = matchRouteParams;
/** @deprecated Import `useResolveSearchCodec_UNSTABLE` from `waku/router/client-core`. */
export const unstable_useResolveSearchCodec = useResolveSearchCodec;
/** @deprecated Import `unstable_parseRoute` from `waku/router/client-core`. */
export const unstable_parseRoute = parseRoute;
