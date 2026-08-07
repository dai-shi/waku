'use client';

import {
  Component,
  createContext,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
  RefObject,
  TransitionFunction,
} from 'react';
import { preloadModule } from 'react-dom';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_addBase as addBase,
  unstable_getErrorInfo as getErrorInfo,
  unstable_isImmutableElement as isImmutableElement,
  unstable_prefetchRsc as prefetchRsc,
  unstable_registerCallServerElementsListener as registerCallServerElementsListener,
  unstable_removeBase as removeBase,
  unstable_upsertRscReloadListener as upsertRscReloadListener,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
  useRefetch_UNSTABLE as useRefetch,
} from '../minimal/client.js';
import { isFollowable, resolveErrorRoute } from './client-utils/error-route.js';
import {
  type PrefetchOptions,
  createPrefetchManager,
} from './client-utils/prefetch-cache.js';
import {
  getRouteUrl,
  isSameRoute,
  isSameRscRoute,
  parseRoute,
} from './client-utils/route-url.js';
import {
  ROUTER_STATE_ID,
  canCommitInstantly,
  getRouteFromElements,
  getRouterState,
  getSettledRoute,
  has404FromElements,
  isStaticFromElements,
  makeRouterState,
  pinForSwr,
  resolveServerRedirect,
} from './client-utils/router-state.js';
import type { RouterState } from './client-utils/router-state.js';
import {
  scrollToHash,
  shouldScrollByDefault,
  shouldScrollForRouteChange,
} from './client-utils/scroll.js';
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
import {
  type AnyCodec,
  getRouteSearchCodecId,
  isCodec,
} from './isomorphic-utils/search-codec-registry.js';

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
 * hands the page to the browser, and when a missing route gets no answer from a
 * Waku server (a Waku server sends the 404 page instead, which resolves). Never
 * waits for a follow, and does not wait for React to render, so the address bar
 * may still show the previous URL.
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

const commitHistory = (url: URL, mode: 'push' | 'replace' | null): void => {
  if (window.location.href === url.href) {
    return;
  }
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url);
    return;
  }
  // null still writes: the state url is the one that should show
  window.history.replaceState(window.history.state, '', url);
};

const reloadWithUrl = (url: URL) => {
  window.history.pushState(window.history.state, '', url);
  window.location.reload();
};

const isAltClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 ||
  !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);

let savedRscParams: [query: string, rscParams: URLSearchParams] | undefined;

const createRscParams = (query: string): URLSearchParams => {
  if (savedRscParams && savedRscParams[0] === query) {
    return savedRscParams[1];
  }
  const rscParams = new URLSearchParams({ query });
  savedRscParams = [query, rscParams];
  return rscParams;
};

type ChangeRouteOptions = {
  shouldScroll: boolean;
  refetch?: boolean; // true: force refetch, false: don't refetch, undefined: auto-decide based on route change
  history: 'push' | 'replace' | null;
  url?: URL | undefined;
  instant?: boolean | undefined;
  isFollow?: boolean | undefined;
};

type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

type PrefetchRoute = (route: RouteProps, options?: PrefetchOptions) => void;

type SliceId = string;

const RouterContext = createContext<{
  route: RouteProps;
  routerState?: RouterState | undefined;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  fetchingSlices: Set<SliceId>;
} | null>(null);

const SearchCodecsContext = createContext<ReadonlyMap<string, AnyCodec>>(
  new Map(),
);

const useResolveSearchCodec = () => {
  const codecs = useContext(SearchCodecsContext);
  return useCallback(
    (routePath: string): AnyCodec | undefined => {
      const id = getRouteSearchCodecId(routePath);
      return id !== undefined ? codecs.get(id) : undefined;
    },
    [codecs],
  );
};

const dispatchChangeRoute = (
  changeRoute: ChangeRoute,
  route: RouteProps,
  options: ChangeRouteOptions,
  startTransitionFn: (fn: TransitionFunction) => void = startTransition,
): Promise<void> => {
  if (options.instant) {
    // instant paints from the cache; a transition would hold that back
    return changeRoute(route, options);
  }
  // a transition keeps the tree up while the eager merge suspends
  return new Promise<void>((resolve, reject) => {
    startTransitionFn(async () => {
      try {
        await changeRoute(route, options);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
};

const useRouterOrThrow = () => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  return router;
};

const resolveRouteHref = <Path extends RoutePath>(
  to: RouteHref | BuildRouteHrefTarget<Path>,
  resolveCodec: ReturnType<typeof useResolveSearchCodec>,
): string =>
  addBase(
    typeof to === 'string' ? to : buildRouteHref(to, resolveCodec),
    import.meta.env.WAKU_CONFIG_BASE_PATH,
  );

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
  const { route, changeRoute, prefetchRoute } = router;
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
      prefetchRoute(parseRoute(url), options);
    },
    [prefetchRoute, resolveCodec],
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

/**
 * Read the current route's params, typed from the `from` path, or null when
 * the current path does not match it. Re-renders when the route path changes.
 * The result is memoized by path, so its identity changes on navigation to a
 * different path; read its fields rather than using the object itself as an
 * effect dependency.
 */
export function useParams_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteParams<Path> | null {
  const { path } = useRouter();
  return useMemo(() => matchRouteParams(from, path), [from, path]);
}

/**
 * Provide search codecs to `useSearch_UNSTABLE`, `useSetSearch_UNSTABLE`,
 * `push`, and `Link`. Render it in your root layout so the codecs are present in
 * both the SSR render and the browser. Pass only search codecs: a codec-only
 * module (via `import * as`), a record, or an array. A value that is not a codec
 * is ignored with a warning, so keep helpers and constants out of the module you
 * pass (or list the codecs explicitly).
 */
export function Unstable_SearchCodecsProvider({
  searchCodecs,
  children,
}: {
  searchCodecs: Record<string, unknown> | readonly unknown[];
  children: ReactNode;
}): ReactElement {
  const codecs = useMemo(() => {
    const map = new Map<string, AnyCodec>();
    const values = Array.isArray(searchCodecs)
      ? searchCodecs
      : Object.values(searchCodecs);
    for (const value of values) {
      if (!isCodec(value)) {
        console.warn(
          'Unstable_SearchCodecsProvider ignored a value that is not a search codec; pass only codecs (a codec-only module or an explicit array).',
          value,
        );
        continue;
      }
      const existing = map.get(value.id);
      if (existing && existing !== value) {
        throw new Error(`Duplicate search codec id: "${value.id}"`);
      }
      map.set(value.id, value);
    }
    return map;
  }, [searchCodecs]);
  return <SearchCodecsContext value={codecs}>{children}</SearchCodecsContext>;
}

/**
 * Read the current route's typed `search`, parsed client-side with the route's
 * codec (provided via `Unstable_SearchCodecsProvider`), or null when the current
 * path does not match `from` or the route has no codec. Re-renders when the
 * query changes.
 */
export function useSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteSearch<Path> | null {
  const { path, query } = useRouter();
  const codecs = useContext(SearchCodecsContext);
  return useMemo(() => {
    if (matchRouteParams(from, path) === null) {
      return null;
    }
    const codecId = getRouteSearchCodecId(from);
    const codec = codecId !== undefined ? codecs.get(codecId) : undefined;
    return codec ? (codec.parse(query) as RouteSearch<Path>) : null;
  }, [from, path, query, codecs]);
}

type SetSearch<Path extends RoutePath> = (
  update:
    | Partial<RouteSearch<Path>>
    | ((prev: RouteSearch<Path>) => Partial<RouteSearch<Path>>),
  options?: { history?: 'push' | 'replace'; scroll?: boolean },
) => Promise<void>;

/**
 * Returns a setter for the current route's `search`, serialized client-side with
 * the route's codec (provided via `Unstable_SearchCodecsProvider`). Accepts a
 * partial or an updater of the current search and navigates (push by default, or
 * replace) to the same path. A no-op when the current path does not match `from`
 * or has no codec.
 */
export function useSetSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): SetSearch<Path> {
  const router = useRouterOrThrow();
  const { route, changeRoute } = router;
  const codecs = useContext(SearchCodecsContext);
  return useCallback<SetSearch<Path>>(
    async (update, options) => {
      if (matchRouteParams(from, route.path) === null) {
        return;
      }
      const codecId = getRouteSearchCodecId(from);
      const codec = codecId !== undefined ? codecs.get(codecId) : undefined;
      if (!codec) {
        return;
      }
      const prev = codec.parse(route.query) as RouteSearch<Path>;
      const partial = typeof update === 'function' ? update(prev) : update;
      const nextQuery = codec.serialize({ ...prev, ...partial });
      const url = new URL(window.location.href);
      url.search = nextQuery;
      await dispatchChangeRoute(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? false,
        history: options?.history ?? 'push',
        url,
      });
    },
    [from, route.path, route.query, codecs, changeRoute],
  );
}

// HACK: commit-phase .current write; extracted so react-hooks/immutability ignores it.
const assignRef = <T,>(ref: RefObject<T | null>, node: T | null): void => {
  ref.current = node;
};

function useSharedRef<T>(
  ref: Ref<T | null> | undefined,
): [RefObject<T | null>, (node: T | null) => void | (() => void)] {
  const managedRef = useRef<T | null>(null);

  const handleRef = useCallback(
    (node: T | null): void | (() => void) => {
      assignRef(managedRef, node);
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        return () => {
          assignRef(managedRef, null);
          if (cleanup) {
            cleanup();
          } else {
            ref(null);
          }
        };
      }
      if (ref) {
        assignRef(ref, node);
      }
      return () => {
        assignRef(managedRef, null);
        if (ref) {
          assignRef(ref, null);
        }
      };
    },
    [ref],
  );

  return [managedRef, handleRef];
}

const prefetchIfNotCurrent = (
  router: { route: RouteProps; prefetchRoute: PrefetchRoute } | null,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
) => {
  if (!router) {
    return;
  }
  const route = parseRoute(new URL(resolvedTo, window.location.href));
  if (!isSameRscRoute(route, router.route)) {
    router.prefetchRoute(route, options);
  }
};

const usePrefetchOnView = (
  ref: RefObject<HTMLAnchorElement | null>,
  router: { route: RouteProps; prefetchRoute: PrefetchRoute } | null,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
) => {
  const enabled = !!options;
  const mode = options?.mode;
  const ttl = options?.ttl;
  useEffect(() => {
    if (!enabled || !ref.current) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            prefetchIfNotCurrent(router, resolvedTo, {
              ...(mode ? { mode } : {}),
              ...(ttl !== undefined ? { ttl } : {}),
            });
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [enabled, mode, ttl, router, resolvedTo, ref]);
};

type NavigationStatus = { pending?: boolean };

const NavigationStatusContext = createContext<NavigationStatus>({});

/**
 * Returns the navigation status of the enclosing `Link`, like React's
 * `useFormStatus`. `pending` is `true` while the navigation transition is in
 * flight, until the destination route's async components resolve. Returns an
 * empty object when called outside a `Link`.
 */
export const useNavigationStatus_UNSTABLE = (): NavigationStatus =>
  useContext(NavigationStatusContext);

export type LinkProps<Path extends RoutePath> = {
  to: RouteHref | BuildRouteHrefTarget<Path>;
  children: ReactNode;
  /**
   * Whether the link should scroll on navigation.
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change or repeated same-hash click (not query-only)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its `<Suspense>` fallbacks right
   * away and stream the dynamic parts in.
   */
  unstable_instant?: boolean;
  unstable_prefetchOnEnter?: PrefetchOptions;
  unstable_prefetchOnView?: PrefetchOptions;
  /**
   * Overrides how the navigation transition is started, e.g. to integrate the
   * browser View Transitions API. When provided, React's `useTransition` is
   * bypassed, so `useNavigationStatus_UNSTABLE()` stays `{ pending: false }` for
   * this link.
   */
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

/**
 * Client-side navigation link. Renders an `<a>`; click handling pushes through
 * the router unless the click is modified or prevented. A non-`_self` `target`
 * is discouraged and still routes in place (use `<a>` instead). Failures
 * surface through the router error boundary rather than a returned promise.
 */
export function Link<Path extends RoutePath>({
  to,
  children,
  scroll,
  unstable_instant,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  ref: refProp,
  ...props
}: LinkProps<Path>): ReactElement {
  const resolveCodec = useResolveSearchCodec();
  const resolvedTo = resolveRouteHref(to, resolveCodec);
  const router = useContext(RouterContext);
  const changeRoute = router
    ? router.changeRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const startTransitionFn = unstable_startTransition || startTransition;
  const [ref, setRef] = useSharedRef<HTMLAnchorElement>(refProp);

  usePrefetchOnView(ref, router, resolvedTo, unstable_prefetchOnView);
  const internalOnClick = () => {
    const url = new URL(resolvedTo, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      preloadRouteModules(route.path);
      // a click has no caller to reject to; the boundary shows the failure
      dispatchChangeRoute(
        changeRoute,
        route,
        {
          shouldScroll: scroll ?? shouldScrollByDefault(url),
          history: 'push',
          url,
          instant: unstable_instant,
        },
        startTransitionFn,
      ).catch(() => {});
    } else if (url.hash && scroll !== false) {
      scrollToHash(url.hash, 'auto', false);
    }
  };
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented || isAltClick(event)) {
      return;
    }
    if (props.target && props.target.toLowerCase() !== '_self') {
      console.warn('[Link] `target` is discouraged. Use `<a>` for this case.');
    }
    if (
      props.download !== undefined &&
      props.download !== null &&
      props.download !== false
    ) {
      console.warn(
        '[Link] `download` is discouraged. Use `<a>` for this case.',
      );
    }
    event.preventDefault();
    internalOnClick();
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        prefetchIfNotCurrent(router, resolvedTo, unstable_prefetchOnEnter);
        props.onMouseEnter?.(event);
      }
    : props.onMouseEnter;
  const navigationStatus = useMemo(() => ({ pending: isPending }), [isPending]);
  return (
    <NavigationStatusContext value={navigationStatus}>
      <a
        {...props}
        href={resolvedTo}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        ref={setRef}
      >
        {children}
      </a>
    </NavigationStatusContext>
  );
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

function renderError(message: string) {
  return (
    <html>
      <head>
        <title>Unhandled Error</title>
      </head>
      <body
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          placeContent: 'center',
          placeItems: 'center',
          fontSize: '16px',
          margin: 0,
        }}
      >
        <h1>Caught an unexpected error</h1>
        <p>Error: {message}</p>
      </body>
    </html>
  );
}

/**
 * Catches render errors from its children and shows a fallback page. Used by
 * the default root layout; apps can wrap their own root with it too. Followable
 * navigation failures are handled inside the router before this boundary.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: unknown }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      if (this.state.error instanceof Error) {
        return renderError(this.state.error.message);
      }
      return renderError(String(this.state.error));
    }
    return this.props.children;
  }
}

const MAX_FOLLOWS_PER_NAVIGATION = 20;

const FollowError = ({
  error,
  has404,
  reset,
  fail,
}: {
  error: unknown;
  has404: boolean;
  reset: () => void;
  fail: (original: unknown, error: unknown) => void;
}) => {
  const { route, routerState, changeRoute } = useRouterOrThrow();
  const { path: routePath, query: routeQuery, hash: routeHash } = route;
  const caughtAtRef = useRef<readonly [string, string, string]>(undefined);
  caughtAtRef.current ??= [routePath, routeQuery, routeHash];
  const leftRef = useRef<string>(undefined);
  const dispatchedRef = useRef<
    | { route: RouteProps; url: string; from: RouterState | undefined }
    | undefined
  >(undefined);
  useEffect(() => {
    const [caughtPath, caughtQuery, caughtHash] = caughtAtRef.current!;
    // a route change means the followed slot is committed; safe to reset
    if (
      routePath !== caughtPath ||
      routeQuery !== caughtQuery ||
      routeHash !== caughtHash
    ) {
      reset();
      return;
    }
    const dispatched = dispatchedRef.current;
    if (
      dispatched &&
      routerState &&
      routerState !== dispatched.from &&
      !routerState.failure
    ) {
      const sameRequest =
        routerState.requested[0] === dispatched.route.path &&
        routerState.requested[1] === dispatched.route.query;
      const followCompleted = sameRequest
        ? dispatched.route.path === routePath
        : routerState.url === dispatched.url;
      if (followCompleted) {
        reset();
      } else {
        fail(error, new Error('detected a navigation loop', { cause: error }));
      }
    }
  }, [routePath, routeQuery, routeHash, routerState, reset, fail, error]);
  const followCaughtError = useEffectEvent(() => {
    // the requested url may not have reached the address bar yet
    const stateUrl = routerState
      ? new URL(routerState.url, window.location.href)
      : new URL(window.location.href);
    const errorRoute = resolveErrorRoute(error, stateUrl, has404);
    if (errorRoute.type === 'none') {
      return;
    }
    if (errorRoute.type === 'unfollowable') {
      fail(
        error,
        new Error(`cannot follow a redirect to ${errorRoute.location}`, {
          cause: error,
        }),
      );
      return;
    }
    if (errorRoute.type === 'leave') {
      // every leave replaces, so a navigation that already wrote its url does
      // not stack an entry the reader never saw. An action leave drops the
      // page it was on, which a form post without javascript would have kept
      if (leftRef.current !== errorRoute.url.href) {
        // dev replays the effect, and firefox cancels a navigation that is
        // replaced while the first is still in flight
        leftRef.current = errorRoute.url.href;
        window.location.replace(errorRoute.url.href);
      }
      return;
    }
    const { target, url } = errorRoute;
    const requested = routerState?.requested;
    const caught = requested
      ? { path: requested[0], query: requested[1] }
      : parseRoute(stateUrl);
    if (isSameRscRoute(target, caught) && url.href === stateUrl.href) {
      fail(error, new Error('detected a navigation loop', { cause: error }));
      return;
    }
    if ((routerState?.followCount ?? 0) >= MAX_FOLLOWS_PER_NAVIGATION) {
      fail(
        error,
        new Error('too many redirect or 404 follows', { cause: error }),
      );
      return;
    }
    dispatchedRef.current = {
      route: target,
      url: url.pathname + url.search + url.hash,
      from: routerState,
    };
    startTransition(() => {
      changeRoute(target, {
        shouldScroll: routerState
          ? routerState.scroll !== null
          : target.path !== caught.path,
        history: 'replace',
        url,
        isFollow: true,
        refetch: true,
      }).catch((err: unknown) => {
        fail(error, err);
      });
    });
  });
  useEffect(() => {
    followCaughtError();
  }, [error, has404]);
  const info = getErrorInfo(error);
  return info?.status === 404 && !has404 ? <h1>Not Found</h1> : null;
};

class CustomErrorHandler extends Component<
  {
    has404: boolean;
    children?: ReactNode;
  },
  { error: unknown | null }
> {
  constructor(props: { has404: boolean; children?: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
    this.fail = this.fail.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  // error is a wrapper: the original still carries a location and would follow
  fail(original: unknown, error: unknown) {
    this.setState((state) => (state.error === original ? { error } : null));
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      if (isFollowable(error)) {
        return (
          <FollowError
            error={error}
            has404={this.props.has404}
            reset={this.reset}
            fail={this.fail}
          />
        );
      }
      throw error;
    }
    return this.props.children;
  }
}

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

const preloadRouteModules = (path: string) => {
  globalThis.__WAKU_ROUTER_PREFETCH__?.(path, (id) => {
    preloadModule(id, { as: 'script' });
  });
};

/**
 * Renders a named slice slot from the current RSC elements. With `lazy`, the
 * first visit fetches the slice if it is missing or mutable; later visits reuse
 * an immutable copy. The lazy `fallback` is shown only while the slot is absent
 * from the elements map (it does not reappear on a later refetch — see FIXME).
 */
export function Slice({
  id,
  children,
  ...props
}: {
  id: SliceId;
  children?: ReactNode;
} & (
  | {
      lazy?: false;
    }
  | {
      lazy: true;
      fallback: ReactNode;
    }
)) {
  const { fetchingSlices } = useRouterOrThrow();
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    if (needsToFetchSlice && !fetchingSlices.has(id)) {
      fetchingSlices.add(id);
      const rscPath = encodeSliceId(id);
      refetch(rscPath)
        .catch((e) => {
          console.error('Failed to fetch slice:', e);
        })
        .finally(() => {
          fetchingSlices.delete(id);
        });
    }
  }, [fetchingSlices, refetch, id, needsToFetchSlice]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}

const InnerRouter = ({
  fallbackRoute,
  routeInterceptor,
}: {
  fallbackRoute: RouteProps;
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined;
}) => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const routeFromElements = getRouteFromElements(elements);
  const resolvedRoute =
    routeFromElements && routeFromElements.path !== fallbackRoute.path
      ? { ...routeFromElements, hash: fallbackRoute.hash }
      : fallbackRoute;
  const initialHashRef = useRef(resolvedRoute.hash);
  // state, not a ref: it is read during render
  const [initialRoute] = useState(() => ({ ...resolvedRoute, hash: '' }));

  const has404 = has404FromElements(elements);
  const staticPathSetRef = useRef<Set<string>>(undefined);
  staticPathSetRef.current ??= new Set();
  // a record mid navigation pairs the new route id with the old static flag
  const addToStaticPathSet = useCallback(
    (responseElements: Record<string, unknown>) => {
      const route = getRouteFromElements(responseElements);
      if (route && isStaticFromElements(responseElements)) {
        staticPathSetRef.current!.add(route.path);
      }
    },
    [],
  );
  const initialElementsRef = useRef(elements);
  useEffect(() => {
    addToStaticPathSet(initialElementsRef.current);
  }, [addToStaticPathSet]);
  const resolvedElementsRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedElementsRef.current = elements;
  }, [elements]);
  const prefetchManagerRef =
    useRef<ReturnType<typeof createPrefetchManager>>(undefined);
  prefetchManagerRef.current ??= createPrefetchManager();

  const refetch = useRefetch();
  const mergeElements = useMergeElements();
  // starts empty so hydration matches the server, then the effect fills it
  const [restoredHash, setRestoredHash] = useState('');
  useEffect(() => {
    setRestoredHash(window.location.hash || initialHashRef.current);
  }, []);

  const routeFallback = useMemo(
    () => ({ ...initialRoute, hash: restoredHash }),
    [initialRoute, restoredHash],
  );
  const routerState = getRouterState(elements);
  const destination = useMemo(
    () =>
      routerState &&
      resolveServerRedirect(elements, routerState, initialRoute.path),
    [elements, routerState, initialRoute],
  );
  const currentRoute = destination ? destination.route : routeFallback;
  // only the current state is reconciled, so one slot is enough
  const appliedRef = useRef<RouterState>(undefined);
  const destinationHref = destination?.url.href;
  const currentHash = currentRoute.hash;
  useLayoutEffect(() => {
    if (!routerState || !destinationHref) {
      return;
    }
    const applied = appliedRef.current === routerState;
    commitHistory(
      new URL(destinationHref),
      applied ? 'replace' : routerState.history,
    );
    appliedRef.current = routerState;
    if (applied || !routerState.scroll || routerState.failure) {
      return;
    }
    const { pathChanged } = routerState.scroll;
    const behavior = pathChanged ? 'instant' : 'auto';
    scrollToHash(currentHash, behavior, pathChanged);
  }, [routerState, destinationHref, currentHash]);

  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        prefetchManagerRef.current!.clear();
        staticPathSetRef.current!.clear();
        const settledRoute = getSettledRoute(
          resolvedElementsRef.current,
          routeFallback,
        );
        startTransition(() => {
          // the reload clears the set, so the response has to teach it again
          void refetch(
            encodeRoutePath(settledRoute.path),
            createRscParams(settledRoute.query),
          ).then(addToStaticPathSet, () => {});
        });
      };
      upsertRscReloadListener(
        globalThis.__WAKU_REFETCH_ROUTE__,
        refetchRouteOnHmr,
      );
      globalThis.__WAKU_REFETCH_ROUTE__ = refetchRouteOnHmr;
    }
  }, [refetch, addToStaticPathSet, routeFallback]);

  // starts empty so hydration matches; filled when a lazy Slice fetches
  const [fetchingSlices] = useState(() => new Set<SliceId>());
  const pendingNavigationRef = useRef<AbortController | null>(null);

  const changeRoute: ChangeRoute = useCallback(
    async function changeRoute(nextRoute, options) {
      pendingNavigationRef.current?.abort();
      pendingNavigationRef.current = null;
      const settledRoute = getSettledRoute(
        resolvedElementsRef.current,
        routeFallback,
      );
      const targetUrl = options.url ?? getRouteUrl(nextRoute);
      const routerState = makeRouterState(nextRoute, targetUrl, {
        history: options.history,
        scroll: options.shouldScroll,
        pathChanged: nextRoute.path !== settledRoute.path,
        followCount: options.isFollow
          ? (getRouterState(resolvedElementsRef.current)?.followCount ?? 0) + 1
          : 0,
      });
      const shouldRefetch =
        options.refetch ?? !isSameRscRoute(nextRoute, settledRoute);
      if (staticPathSetRef.current!.has(nextRoute.path) || !shouldRefetch) {
        mergeElements({
          [ROUTE_ID]: [nextRoute.path, nextRoute.query],
          [ROUTER_STATE_ID]: routerState,
        });
        return;
      }
      const controller = new AbortController();
      pendingNavigationRef.current = controller;
      const rscPath = encodeRoutePath(nextRoute.path);
      const cached = prefetchManagerRef.current!.get(rscPath, nextRoute.query);
      const prefetchedElements =
        prefetchManagerRef.current!.getElements(rscPath);
      const instant =
        options.instant &&
        canCommitInstantly(
          getRouteSlotId(nextRoute.path),
          resolvedElementsRef.current,
          prefetchedElements,
        );
      const dataPromise = refetch(rscPath, createRscParams(nextRoute.query), {
        signal: controller.signal,
        unstable_overlay: {
          [ROUTER_STATE_ID]: routerState,
          // meta is pinned, so an instant nav has to carry it or it goes stale
          ...(instant
            ? {
                [ROUTE_ID]: [nextRoute.path, nextRoute.query],
                [IS_STATIC_ID]: isStaticFromElements(
                  resolvedElementsRef.current,
                ),
              }
            : {}),
        },
        ...(instant
          ? {
              unstable_swr: {
                pin: pinForSwr(() => resolvedElementsRef.current),
                ...(prefetchedElements ? { base: prefetchedElements } : {}),
              },
            }
          : {}),
        onBuildIdMismatch: () => reloadWithUrl(targetUrl),
        ...(cached ? { unstable_prefetched: cached.promise } : {}),
      });
      try {
        const resolved = await dataPromise;
        if (controller.signal.aborted) {
          return;
        }
        pendingNavigationRef.current = null;
        addToStaticPathSet(resolved);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        pendingNavigationRef.current = null;
        // write the url now; an unrecoverable rethrow discards the commit
        commitHistory(targetUrl, routerState.history);
        mergeElements({
          [ROUTER_STATE_ID]: {
            ...routerState,
            history: null, // the url above is already written
            failure: { error: e, committedHash: settledRoute.hash },
          },
        });
        throw e;
      }
    },
    [routeFallback, refetch, mergeElements, addToStaticPathSet],
  );

  const changeRouteFromServer = useCallback(
    async (routeData: unknown, isStatic: unknown) => {
      if (!routeData) {
        return;
      }
      const [path, query] = routeData as [string, string];
      const settledRoute = getSettledRoute(
        resolvedElementsRef.current,
        routeFallback,
      );
      if (
        settledRoute.path === path &&
        (isStatic || settledRoute.query === query)
      ) {
        return;
      }
      const route = { path, query, hash: '' };
      const is404 = path === '/404';
      await dispatchChangeRoute(changeRoute, route, {
        refetch: false,
        shouldScroll: false,
        // the 404 route renders where the user already is
        history: is404 ? null : 'push',
        url: is404 ? new URL(window.location.href) : getRouteUrl(route),
      });
    },
    [changeRoute, routeFallback],
  );
  useEffect(() => {
    const listener = (elements: Record<string, unknown>) => {
      addToStaticPathSet(elements);
      const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = elements;
      changeRouteFromServer(routeData, isStatic).catch((err) => {
        if (!isFollowable(err)) {
          console.error('Error while handling route updates:', err);
        }
      });
    };
    return registerCallServerElementsListener(listener);
  }, [changeRouteFromServer, addToStaticPathSet]);

  const prefetchRoute: PrefetchRoute = useCallback((route, options) => {
    preloadRouteModules(route.path);
    if (staticPathSetRef.current!.has(route.path)) {
      return;
    }
    const rscPath = encodeRoutePath(route.path);
    prefetchManagerRef.current!.prefetch(
      rscPath,
      route.query,
      (base) =>
        prefetchRsc(rscPath, createRscParams(route.query), {
          ...(base ? { unstable_base: base } : {}),
        }),
      options,
    );
  }, []);

  useEffect(() => {
    const callback = () => {
      const popped = parseRoute(new URL(window.location.href));
      const nextRoute = routeInterceptor ? routeInterceptor(popped) : popped;
      if (!nextRoute) {
        return;
      }
      startTransition(() => {
        changeRoute(nextRoute, {
          shouldScroll: shouldScrollForRouteChange(
            nextRoute,
            getSettledRoute(resolvedElementsRef.current, routeFallback),
          ),
          history: null, // the browser already moved the address bar
          // keep the url it moved to; an interceptor rewrite needs a new one
          url: isSameRoute(nextRoute, popped)
            ? new URL(window.location.href)
            : getRouteUrl(nextRoute),
        }).catch((err) => {
          if (!isFollowable(err)) {
            console.error('Error while navigating back:', err);
          }
        });
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute, routeInterceptor, routeFallback]);

  const routeElement = routerState?.failure ? (
    <ThrowError error={routerState.failure.error} />
  ) : (
    <Slot id={getRouteSlotId(currentRoute.path)} />
  );
  // TODO a followable error thrown by the root layout, or by an action it
  // calls, is not followed. The layout's own ErrorBoundary catches it first,
  // so wrapping this slot in another handler does not reach it
  const rootElement = (
    <Slot id="root">
      <CustomErrorHandler has404={has404}>{routeElement}</CustomErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route: currentRoute,
        routerState,
        changeRoute,
        prefetchRoute,
        fetchingSlices,
      }}
    >
      {rootElement}
    </RouterContext>
  );
};

/**
 * Client router root. Mount once near the app root so `useRouter`, `Link`, and
 * related hooks share navigation state. `initialRoute` defaults to the current
 * browser location.
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
  const initialRscParams = createRscParams(initialRoute.query);
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
    <>
      <RouterContext
        value={{
          route,
          changeRoute: notAvailableInServer('changeRoute'),
          prefetchRoute: notAvailableInServer('prefetchRoute'),
          fetchingSlices: new Set<SliceId>(),
        }}
      >
        {rootElement}
      </RouterContext>
    </>
  );
}

// Internal APIs exposed for other Waku packages and integrations.
// Subject to change without notice.
export type Unstable_RouteProps = RouteProps;
export const unstable_HAS404_ID = HAS404_ID;
export const unstable_IS_STATIC_ID = IS_STATIC_ID;
export const unstable_ROUTE_ID = ROUTE_ID;
export const unstable_encodeRoutePath = encodeRoutePath;
export const unstable_encodeSliceId = encodeSliceId;
export const unstable_getRouteSlotId = getRouteSlotId;
export const unstable_getSliceSlotId = getSliceSlotId;
export const unstable_getErrorInfo = getErrorInfo;
export const unstable_addBase = addBase;
export const unstable_removeBase = removeBase;
export const unstable_RouterContext = RouterContext;
export type Unstable_ChangeRoute = ChangeRoute;
export type Unstable_PrefetchRoute = PrefetchRoute;
export type Unstable_PrefetchOptions = PrefetchOptions;
export type Unstable_SliceId = SliceId;
export type Unstable_RouteHref = RouteHref;
export type Unstable_RoutePath = RoutePath;
export type Unstable_BuildRouteHrefTarget<Path extends RoutePath> =
  BuildRouteHrefTarget<Path>;
export type Unstable_RouteParams<Path extends RoutePath> = RouteParams<Path>;
export type Unstable_RouteSearch<Path extends RoutePath> = RouteSearch<Path>;
export const unstable_buildRouteHref = buildRouteHref;
export const unstable_matchRouteParams = matchRouteParams;
export const unstable_useResolveSearchCodec = useResolveSearchCodec;
export const unstable_parseRoute = parseRoute;
