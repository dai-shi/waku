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
import { ETAG_ID_PREFIX } from '../lib/utils/etags.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_addBase as addBase,
  unstable_fetchRsc as fetchRsc,
  unstable_getErrorInfo as getErrorInfo,
  unstable_isImmutableElement as isImmutableElement,
  unstable_registerCallServerElementsListener as registerCallServerElementsListener,
  unstable_registerRscReloadListener as registerRscReloadListener,
  unstable_removeBase as removeBase,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../minimal/client.js';
import { decideFollow, isFollowable } from './client-utils/error-route.js';
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

type Elements = Record<string | symbol, unknown>;

type RefetchOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  prefetched?: Promise<Elements>;
  unstable_overlay?: Elements;
  unstable_swr?: {
    pin: (key: string | symbol) => boolean;
    base?: Elements;
  };
};

type Refetch = (
  rscPath: string,
  rscParams?: unknown,
  options?: RefetchOptions,
) => Promise<Elements>;

const useRefetch = (): Refetch => {
  const mergeElements = useMergeElements();
  return useCallback(
    (rscPath, rscParams, options = {}) => {
      const { prefetched, unstable_overlay, unstable_swr, ...fetchOptions } =
        options;
      const elements = prefetched
        ? abortable(prefetched, options.signal)
        : fetchRsc(rscPath, rscParams, {
            ...fetchOptions,
            ...(unstable_swr?.base ? { unstable_base: unstable_swr.base } : {}),
          });
      return mergeElements(elements, {
        ...(unstable_overlay ? { unstable_overlay } : {}),
        ...(unstable_swr ? { unstable_swr } : {}),
      });
    },
    [mergeElements],
  );
};

const abortable = <T,>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};

const fetchRouteElements = (
  rscPath: string,
  rscParams: URLSearchParams,
  {
    signal,
    prefetched,
    onBuildIdMismatch,
    base,
  }: {
    signal: AbortSignal;
    prefetched?: Promise<Elements>;
    onBuildIdMismatch: () => void;
    base: Elements;
  },
): Promise<Elements> => {
  return prefetched
    ? abortable(prefetched, signal)
    : fetchRsc(rscPath, rscParams, {
        signal,
        onBuildIdMismatch,
        unstable_base: base,
      });
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
  follows?: number | undefined;
  startTransition?: ((fn: TransitionFunction) => void) | undefined;
  pendingTransition?: ((fn: TransitionFunction) => void) | undefined;
};

type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

type HistoryIntent = ChangeRouteOptions['history'];

type NavigationAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

type NavigationOutcome =
  | {
      type: 'landed';
      attempt: NavigationAttempt;
      history: HistoryIntent;
      elements: Elements;
      instant: boolean;
    }
  | {
      type: 'reused';
      attempt: NavigationAttempt;
      history: HistoryIntent;
    }
  | {
      type: 'left';
      attempt: NavigationAttempt;
      history: HistoryIntent;
      url: URL;
      error: unknown;
    }
  | {
      type: 'failed';
      attempt: NavigationAttempt;
      history: HistoryIntent;
      error: unknown;
      restoreBase: boolean;
    }
  | { type: 'superseded' };

type PrefetchRoute = (route: RouteProps, options?: PrefetchOptions) => void;

type SliceId = string;

const RouterContext = createContext<{
  route: RouteProps;
  routerState?: RouterState | undefined;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  fetchingSlices: Map<SliceId, Promise<Elements>>;
  lazySliceIds: Set<SliceId>;
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

const canPaintInstantOverlay = (
  follows: number,
  routeSlotId: string,
  resolvedElements: Record<string, unknown>,
  prefetchedElements: Record<string, unknown> | null | undefined,
) =>
  !follows &&
  canCommitInstantly(routeSlotId, resolvedElements, prefetchedElements);

const dispatchChangeRoute = (
  changeRoute: ChangeRoute,
  route: RouteProps,
  options: ChangeRouteOptions,
  startTransitionFn: (fn: TransitionFunction) => void = startTransition,
): Promise<void> => {
  if (options.instant && !options.startTransition) {
    // skip the outer wrap until changeRoute knows it will actually paint
    return changeRoute(route, {
      ...options,
      pendingTransition: startTransitionFn,
    });
  }
  if (options.startTransition) {
    return changeRoute(route, options);
  }
  // a transition keeps the current tree up while the destination loads
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
   * Overrides how the destination is committed, e.g. to integrate the browser
   * View Transitions API. It runs after required route data is ready. When
   * `unstable_instant` can commit immediately from cache, this is ignored. When
   * provided, React's `useTransition` is bypassed, so
   * `useNavigationStatus_UNSTABLE()` stays `{ pending: false }` for this link.
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
  const [ref, setRef] = useSharedRef<HTMLAnchorElement>(refProp);

  usePrefetchOnView(ref, router, resolvedTo, unstable_prefetchOnView);
  const internalOnClick = () => {
    const url = new URL(resolvedTo, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      preloadRouteModules(route.path);
      dispatchChangeRoute(
        changeRoute,
        route,
        {
          shouldScroll: scroll ?? shouldScrollByDefault(url),
          history: 'push',
          url,
          instant: unstable_instant,
          startTransition: unstable_startTransition,
        },
        startTransition,
        // a click has no caller to reject to; the boundary shows the failure
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
 * Catches errors from its children and shows a fallback page. Used by the
 * default root layout; apps can wrap their own root with it too.
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
    if (dispatched && routerState && routerState !== dispatched.from) {
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
    const requested = routerState?.requested;
    const caught = requested
      ? { path: requested[0], query: requested[1] }
      : parseRoute(stateUrl);
    const follows = routerState?.follows ?? 0;
    const decision = decideFollow(
      error,
      { route: caught, url: stateUrl, follows },
      {
        has404,
        maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
      },
    );
    if (decision.type === 'none') {
      return;
    }
    if (decision.type === 'stop') {
      fail(error, decision.error);
      return;
    }
    if (decision.type === 'leave') {
      // every leave replaces, so a navigation that already wrote its url does
      // not stack an entry the reader never saw. An action leave drops the
      // page it was on, which a form post without javascript would have kept
      if (leftRef.current !== decision.url.href) {
        // dev replays the effect, and firefox cancels a navigation that is
        // replaced while the first is still in flight
        leftRef.current = decision.url.href;
        window.location.replace(decision.url.href);
      }
      return;
    }
    const { target, url } = decision;
    const nextFollows = follows + 1;
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
        refetch: true,
        follows: nextFollows,
      }).catch((err: unknown) => {
        const rejected = decideFollow(
          err,
          { route: target, url, follows: nextFollows },
          { has404, maxFollows: MAX_FOLLOWS_PER_NAVIGATION },
        );
        if (rejected.type !== 'leave') {
          fail(error, err);
        }
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

const fetchSlice = (
  id: SliceId,
  mergeElements: ReturnType<typeof useMergeElements>,
  fetchingSlices: Map<SliceId, Promise<Elements>>,
  options?: { replace?: boolean },
) => {
  if (fetchingSlices.has(id) && !options?.replace) {
    return;
  }
  const request = fetchRsc(encodeSliceId(id));
  fetchingSlices.set(id, request);
  request
    .then((result) => {
      if (fetchingSlices.get(id) === request) {
        return mergeElements(result);
      }
    })
    .catch((e) => {
      console.error('Failed to fetch slice:', e);
    })
    .finally(() => {
      if (fetchingSlices.get(id) === request) {
        fetchingSlices.delete(id);
      }
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
  const { fetchingSlices, lazySliceIds } = useRouterOrThrow();
  const mergeElements = useMergeElements();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    if (props.lazy) {
      lazySliceIds.add(id);
    }
  }, [id, lazySliceIds, props.lazy]);
  useEffect(() => {
    if (needsToFetchSlice) {
      fetchSlice(id, mergeElements, fetchingSlices);
    }
  }, [fetchingSlices, id, mergeElements, needsToFetchSlice]);
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
  const [fetchingSlices] = useState(
    () => new Map<SliceId, Promise<Elements>>(),
  );
  // Lazy slice elements stay cached after unmount, so their ids do too.
  const [lazySliceIds] = useState(() => new Set<SliceId>());
  const pendingNavigationRef = useRef<{
    controller: AbortController;
    queuedState?: RouterState;
  } | null>(null);
  // starts empty so hydration matches the server, then the effect fills it
  const [restoredHash, setRestoredHash] = useState('');
  const [navigationError, setNavigationError] = useState<{
    error: unknown;
  }>();
  useEffect(() => {
    setRestoredHash(window.location.hash || initialHashRef.current);
  }, []);
  useEffect(() => {
    if (import.meta.hot) {
      // The listener below owns the current route, not Root's initial path.
      registerRscReloadListener(() => {}, { replace: true });
    }
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
    const queuedState = pendingNavigationRef.current?.queuedState;
    if (queuedState && queuedState === routerState) {
      addToStaticPathSet(elements);
      pendingNavigationRef.current = null;
    }
    if (!routerState || !destinationHref) {
      return;
    }
    const applied = appliedRef.current === routerState;
    commitHistory(
      new URL(destinationHref),
      applied ? 'replace' : routerState.history,
    );
    appliedRef.current = routerState;
    if (applied || !routerState.scroll) {
      return;
    }
    const { pathChanged } = routerState.scroll;
    const behavior = pathChanged ? 'instant' : 'auto';
    scrollToHash(currentHash, behavior, pathChanged);
  }, [elements, routerState, destinationHref, currentHash, addToStaticPathSet]);

  const cancelPendingNavigation = useCallback(() => {
    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigation?.controller.abort();
    if (pendingNavigation?.queuedState) {
      // Append the committed snapshot after the superseded transition update.
      // The explicit key also clears state absent from the initial snapshot.
      const committed = resolvedElementsRef.current;
      void mergeElements({
        ...committed,
        [ROUTER_STATE_ID]: getRouterState(committed),
      });
    }
    pendingNavigationRef.current = null;
  }, [mergeElements]);

  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        cancelPendingNavigation();
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
          lazySliceIds.forEach((id) => {
            fetchSlice(id, mergeElements, fetchingSlices, { replace: true });
          });
        });
      };
      return registerRscReloadListener(refetchRouteOnHmr);
    }
  }, [
    refetch,
    addToStaticPathSet,
    routeFallback,
    cancelPendingNavigation,
    lazySliceIds,
    fetchingSlices,
    mergeElements,
  ]);

  const changeRoute: ChangeRoute = useCallback(
    async function changeRoute(nextRoute, options) {
      const settledRoute = getSettledRoute(
        resolvedElementsRef.current,
        routeFallback,
      );
      const shouldRefetch =
        options.refetch ?? !isSameRscRoute(nextRoute, settledRoute);
      // a navigation that commits synchronously must not be wrapped: a transition
      // would deprioritise the paint that unstable_instant exists to deliver
      if (
        options.pendingTransition &&
        shouldRefetch &&
        !staticPathSetRef.current!.has(nextRoute.path) &&
        !canPaintInstantOverlay(
          options.follows ?? 0,
          getRouteSlotId(nextRoute.path),
          resolvedElementsRef.current,
          prefetchManagerRef.current!.getElements(
            encodeRoutePath(nextRoute.path),
          ),
        )
      ) {
        const schedule = options.pendingTransition;
        // React's startTransition runs fn now, so cancel still happens in this turn.
        return new Promise<void>((resolve, reject) => {
          schedule(async () => {
            try {
              await changeRoute(nextRoute, {
                ...options,
                pendingTransition: undefined,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      }
      cancelPendingNavigation();
      setNavigationError(undefined);
      if (import.meta.hot) {
        // A route navigation retires the previous Minimal refetch target.
        registerRscReloadListener(() => {}, { replace: true });
      }
      const routeUrl = options.url ?? getRouteUrl(nextRoute);
      const initialAttempt: NavigationAttempt = {
        route: nextRoute,
        url: routeUrl,
        follows: options.follows ?? 0,
      };
      const requestedPathChanged =
        initialAttempt.route.path !== settledRoute.path;
      const makeStateForAttempt = (
        attempt: NavigationAttempt,
        history: HistoryIntent,
      ): RouterState =>
        makeRouterState(attempt.route, attempt.url, {
          history,
          scroll: options.shouldScroll,
          pathChanged:
            requestedPathChanged || attempt.route.path !== settledRoute.path,
          follows: attempt.follows,
        });
      const controller = new AbortController();
      pendingNavigationRef.current = { controller };
      const commit = (
        state: RouterState,
        update: () => void,
        transition: ChangeRouteOptions['startTransition'],
      ) => {
        const callback = () => {
          if (controller.signal.aborted) {
            return;
          }
          pendingNavigationRef.current = { controller, queuedState: state };
          update();
        };
        if (transition) {
          transition(callback);
        } else {
          callback();
        }
      };
      const commitRoute = (
        route: RouteProps,
        state: RouterState,
        transition: ChangeRouteOptions['startTransition'],
      ) => {
        commit(
          state,
          () => {
            void mergeElements({
              [ROUTE_ID]: [route.path, route.query],
              [ROUTER_STATE_ID]: state,
            });
          },
          transition,
        );
      };
      if (staticPathSetRef.current!.has(nextRoute.path) || !shouldRefetch) {
        commitRoute(
          nextRoute,
          makeStateForAttempt(initialAttempt, options.history),
          options.instant ? undefined : options.startTransition,
        );
        return;
      }
      const base = resolvedElementsRef.current;
      const fetchRoute = async (
        attempt: NavigationAttempt,
        history: HistoryIntent,
        restoreBase: boolean,
      ): Promise<NavigationOutcome> => {
        if (
          attempt.follows > 0 &&
          staticPathSetRef.current!.has(attempt.route.path)
        ) {
          return { type: 'reused', attempt, history };
        }
        const rscPath = encodeRoutePath(attempt.route.path);
        const prefetchManager = prefetchManagerRef.current!;
        const cached = prefetchManager.get(rscPath, attempt.route.query);
        cached?.onInvalidate(() => {
          if (!controller.signal.aborted) {
            reloadWithUrl(attempt.url);
          }
        });
        const prefetchedElements = prefetchManager.getElements(rscPath);
        const instant =
          !!options.instant &&
          canPaintInstantOverlay(
            attempt.follows,
            getRouteSlotId(attempt.route.path),
            resolvedElementsRef.current,
            prefetchedElements,
          );
        const rscParams = createRscParams(attempt.route.query);
        let elements: Elements;
        try {
          elements = await (instant
            ? refetch(rscPath, rscParams, {
                signal: controller.signal,
                unstable_overlay: {
                  [ROUTER_STATE_ID]: makeStateForAttempt(attempt, history),
                  // meta is pinned, so an instant nav has to carry it or it goes stale
                  [ROUTE_ID]: [attempt.route.path, attempt.route.query],
                  [IS_STATIC_ID]: isStaticFromElements(
                    resolvedElementsRef.current,
                  ),
                },
                unstable_swr: {
                  pin: pinForSwr(() => resolvedElementsRef.current),
                  ...(prefetchedElements ? { base: prefetchedElements } : {}),
                },
                onBuildIdMismatch: () => reloadWithUrl(attempt.url),
                ...(cached ? { prefetched: cached.promise } : {}),
              })
            : fetchRouteElements(rscPath, rscParams, {
                signal: controller.signal,
                ...(cached ? { prefetched: cached.promise } : {}),
                onBuildIdMismatch: () => reloadWithUrl(attempt.url),
                base,
              }));
        } catch (error) {
          if (controller.signal.aborted) {
            return { type: 'superseded' };
          }
          const decision = decideFollow(error, attempt, {
            has404,
            maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
          });
          if (decision.type === 'leave') {
            return {
              type: 'left',
              attempt,
              history,
              url: decision.url,
              error,
            };
          }
          if (decision.type !== 'follow') {
            return {
              type: 'failed',
              attempt,
              history,
              error: decision.type === 'stop' ? decision.error : error,
              restoreBase: restoreBase || instant,
            };
          }
          if (instant) {
            // the paint already wrote this url, so the follow replaces it
            commitHistory(attempt.url, history);
          }
          const nextAttempt = {
            route: decision.target,
            url: decision.url,
            follows: attempt.follows + 1,
          };
          const nextHistory = instant && history !== null ? 'replace' : history;
          if (
            // A render-time follow may be retrying the route whose slot threw.
            initialAttempt.follows === 0 &&
            isSameRscRoute(decision.target, attempt.route) &&
            isSameRscRoute(decision.target, settledRoute)
          ) {
            return {
              type: 'reused',
              attempt: nextAttempt,
              history: nextHistory,
            };
          }
          return fetchRoute(nextAttempt, nextHistory, restoreBase || instant);
        }
        return controller.signal.aborted
          ? { type: 'superseded' }
          : { type: 'landed', attempt, history, elements, instant };
      };
      const outcome = await fetchRoute(initialAttempt, options.history, false);
      if (outcome.type === 'superseded') {
        return;
      }
      if (outcome.type === 'reused') {
        commitRoute(
          outcome.attempt.route,
          makeStateForAttempt(outcome.attempt, outcome.history),
          options.startTransition || startTransition,
        );
        return;
      }
      if (outcome.type === 'left') {
        commitHistory(outcome.attempt.url, outcome.history);
        pendingNavigationRef.current = null;
        window.location.replace(outcome.url.href);
        throw outcome.error;
      }
      if (outcome.type === 'failed') {
        const { error } = outcome;
        const showError = () => {
          if (controller.signal.aborted) {
            return;
          }
          commitHistory(outcome.attempt.url, outcome.history);
          const failureState: RouterState = {
            ...makeRouterState(outcome.attempt.route, outcome.attempt.url, {
              history: null,
              scroll: false,
              pathChanged: false,
              follows: outcome.attempt.follows,
            }),
            failedFrom: settledRoute,
          };
          void mergeElements({
            ...(outcome.restoreBase
              ? {
                  [ROUTE_ID]: base[ROUTE_ID],
                  [IS_STATIC_ID]: base[IS_STATIC_ID],
                }
              : {}),
            [ROUTER_STATE_ID]: failureState,
          });
          pendingNavigationRef.current = null;
          setNavigationError({ error });
        };
        if (options.startTransition) {
          options.startTransition(showError);
        } else {
          showError();
        }
        throw error;
      }
      const { attempt, elements } = outcome;
      if (outcome.instant) {
        addToStaticPathSet(elements);
        pendingNavigationRef.current = null;
        return;
      }
      const destination = resolveServerRedirect(
        elements,
        makeStateForAttempt(attempt, outcome.history),
        attempt.route.path,
      );
      const finalState = makeRouterState(destination.route, destination.url, {
        history: outcome.history,
        scroll: options.shouldScroll,
        pathChanged:
          requestedPathChanged || destination.route.path !== settledRoute.path,
        follows: attempt.follows,
      });
      commit(
        finalState,
        () => {
          const current = resolvedElementsRef.current;
          const update: Elements = {};
          const responseRoute =
            getRouteFromElements(elements) ?? destination.route;
          const routeSlotId = getRouteSlotId(responseRoute.path);
          const routeEtagId = ETAG_ID_PREFIX + routeSlotId;
          const rscRouteChanged = !isSameRscRoute(responseRoute, settledRoute);
          // A server action can merge newer values while this request waits.
          for (const [key, value] of Object.entries(elements)) {
            if (
              (rscRouteChanged &&
                (key === routeSlotId || key === routeEtagId)) ||
              (Object.hasOwn(current, key) === Object.hasOwn(base, key) &&
                current[key] === base[key])
            ) {
              update[key] = value;
            }
          }
          Object.assign(update, {
            ...(ROUTE_ID in elements ? { [ROUTE_ID]: elements[ROUTE_ID] } : {}),
            ...(HAS404_ID in elements
              ? { [HAS404_ID]: elements[HAS404_ID] }
              : {}),
            ...(IS_STATIC_ID in elements
              ? { [IS_STATIC_ID]: elements[IS_STATIC_ID] }
              : {}),
            [ROUTER_STATE_ID]: finalState,
          });
          void mergeElements(update);
        },
        options.startTransition || startTransition,
      );
    },
    [
      routeFallback,
      refetch,
      mergeElements,
      addToStaticPathSet,
      cancelPendingNavigation,
      has404,
    ],
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
    const prefetchManager = prefetchManagerRef.current!;
    prefetchManager.prefetch(
      rscPath,
      route.query,
      (base, invalidate) =>
        fetchRsc(rscPath, createRscParams(route.query), {
          ...(base ? { unstable_base: base } : {}),
          onBuildIdMismatch: () => {
            invalidate();
            prefetchManager.clear();
          },
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
        lazySliceIds,
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
          fetchingSlices: new Map<SliceId, Promise<Elements>>(),
          lazySliceIds: new Set<SliceId>(),
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
