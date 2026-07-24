'use client';

import {
  Component,
  createContext,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
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
  Root,
  Slot,
  unstable_addBase as addBase,
  unstable_getErrorInfo as getErrorInfo,
  unstable_isImmutableElement as isImmutableElement,
  unstable_prefetchRsc as prefetchRsc,
  unstable_registerCallServerElementsListener as registerCallServerElementsListener,
  unstable_removeBase as removeBase,
  unstable_upsertRscReloadListener as upsertRscReloadListener,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
  useRefetch,
} from '../minimal/client.js';
import {
  getRouteFromElements,
  getServerRedirect,
  has404FromElements,
  isStaticFromElements,
} from './client-utils/elements-meta.js';
import {
  NAV_ID,
  canCommitInstantly,
  deriveCommitted,
  getRouteUrl,
  isSameRoute,
  makeNavState,
  parseRedirectUrl,
  parseRoute,
  pathnameToCurrentRoutePath,
  pinForSwr,
} from './client-utils/navigate.js';
import type { NavState } from './client-utils/navigate.js';
import {
  type PrefetchOptions,
  createPrefetchManager,
} from './client-utils/prefetch-cache.js';
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
   * indicates if the link should scroll or not on navigation
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change (not on query-only change)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its <Suspense> fallbacks right
   * away and stream the dynamic parts in, instead of waiting for the response.
   */
  unstable_instant?: boolean;
};

type Navigate = {
  (to: RouteHref, options?: NavigateOptions): Promise<void>;
  <Path extends RoutePath>(
    target: BuildRouteHrefTarget<Path>,
    options?: NavigateOptions,
  ): Promise<void>;
};

type Prefetch = {
  (to: RouteHref, options?: PrefetchOptions): void;
  <Path extends RoutePath>(
    target: BuildRouteHrefTarget<Path>,
    options?: PrefetchOptions,
  ): void;
};

const parseRouteFromLocation = (): RouteProps => {
  return parseRoute(new URL(window.location.href));
};

const reloadWithUrl = (url: URL) => {
  window.history.pushState(window.history.state, '', url);
  window.location.reload();
};

const shouldScrollByDefault = (url: URL) =>
  pathnameToCurrentRoutePath(url.pathname) !==
    pathnameToCurrentRoutePath(window.location.pathname) ||
  url.hash !== window.location.hash;

const isPathChange = (next: RouteProps, prev: RouteProps) =>
  next.path !== prev.path;

const isHashChange = (next: RouteProps, prev: RouteProps) =>
  next.hash !== prev.hash;

const shouldScrollForRouteChange = (next: RouteProps, prev: RouteProps) =>
  isPathChange(next, prev) || isHashChange(next, prev);

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
  push?: boolean;
  url?: URL | undefined;
  instant?: boolean | undefined;
};

// resolves with a followable error instead of rejecting: a follow is a handoff
type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<unknown>;

type ChangeRouteEvent = 'start' | 'complete';

type ChangeRouteCallback = (route: RouteProps) => void;

type PrefetchRoute = (route: RouteProps, options?: PrefetchOptions) => void;

type SliceId = string;

const createRouteChangeListeners = (): [
  Record<
    'on' | 'off',
    (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
  >,
  (event: ChangeRouteEvent, route: RouteProps) => void,
] => {
  const listeners: Record<ChangeRouteEvent, Set<ChangeRouteCallback>> = {
    start: new Set(),
    complete: new Set(),
  };
  const emit = (event: ChangeRouteEvent, route: RouteProps) => {
    const eventListenersSet = listeners[event];
    if (!eventListenersSet.size) {
      return;
    }
    for (const listener of eventListenersSet) {
      listener(route);
    }
  };
  return [
    {
      on: (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].add(handler);
      },
      off: (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].delete(handler);
      },
    },
    emit,
  ];
};

// This is an internal thing, not a public API
const RouterContext = createContext<{
  route: RouteProps;
  nav?: NavState | undefined;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  routeChangeEvents: Record<
    'on' | 'off',
    (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
  >;
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

// a transition, so the eager elements merge suspends without blanking the tree
const changeRouteInTransition = (
  changeRoute: ChangeRoute,
  route: RouteProps,
  options: ChangeRouteOptions,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    startTransition(() => {
      try {
        changeRoute(route, options).then(() => resolve(), reject);
      } catch (e) {
        reject(e);
      }
    });
  });

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

const resolveRouteUrl = <Path extends RoutePath>(
  to: RouteHref | BuildRouteHrefTarget<Path>,
  resolveCodec: ReturnType<typeof useResolveSearchCodec>,
): URL => new URL(resolveRouteHref(to, resolveCodec), window.location.href);

export function useRouter() {
  const router = useRouterOrThrow();
  const { route, changeRoute, prefetchRoute } = router;
  const resolveCodec = useResolveSearchCodec();
  const push = useCallback(
    async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const url = resolveRouteUrl(to, resolveCodec);
      await changeRouteInTransition(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        push: true,
        url,
        instant: options?.unstable_instant,
      });
    },
    [changeRoute, resolveCodec],
  ) as Navigate;
  const replace = useCallback(
    async (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: NavigateOptions,
    ) => {
      const url = resolveRouteUrl(to, resolveCodec);
      await changeRouteInTransition(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        url,
        instant: options?.unstable_instant,
      });
    },
    [changeRoute, resolveCodec],
  ) as Navigate;
  const reload = useCallback(async () => {
    await changeRouteInTransition(changeRoute, parseRouteFromLocation(), {
      shouldScroll: true,
      refetch: true,
    });
  }, [changeRoute]);
  const back = useCallback(() => {
    // FIXME is this correct?
    window.history.back();
  }, []);
  const forward = useCallback(() => {
    // FIXME is this correct?
    window.history.forward();
  }, []);
  const prefetch = useCallback(
    (
      to: RouteHref | BuildRouteHrefTarget<RoutePath>,
      options?: PrefetchOptions,
    ) => {
      const url = resolveRouteUrl(to, resolveCodec);
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
    unstable_events: router.routeChangeEvents,
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
      await changeRouteInTransition(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? false,
        push: (options?.history ?? 'push') === 'push',
        url,
      });
    },
    [from, route.path, route.query, codecs, changeRoute],
  );
}

function useSharedRef<T>(
  ref: Ref<T | null> | undefined,
): [RefObject<T | null>, (node: T | null) => void | (() => void)] {
  const managedRef = useRef<T>(null);

  const handleRef = useCallback(
    // eslint-disable-next-line react-hooks/immutability
    (node: T | null): void | (() => void) => {
      managedRef.current = node;
      const isRefCallback = typeof ref === 'function';
      let cleanup: void | (() => void);
      if (isRefCallback) {
        cleanup = ref(node);
      } else if (ref) {
        // TODO is this a false positive?
        // eslint-disable-next-line react-hooks/immutability
        ref.current = node;
      }
      return () => {
        managedRef.current = null;
        if (isRefCallback) {
          if (cleanup) {
            cleanup();
          } else {
            ref(null);
          }
        } else if (ref) {
          ref.current = null;
        }
      };
    },
    [ref],
  );

  return [managedRef, handleRef];
}

const prefetchIfNotCurrent = (
  router: { prefetchRoute: PrefetchRoute } | null,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
) => {
  const url = new URL(resolvedTo, window.location.href);
  if (router && url.href !== window.location.href) {
    router.prefetchRoute(parseRoute(url), options);
  }
};

const usePrefetchOnView = (
  ref: RefObject<HTMLAnchorElement | null>,
  router: { prefetchRoute: PrefetchRoute } | null,
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
   * indicates if the link should scroll or not on navigation
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change or repeated same-hash click (not query-only)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its <Suspense> fallbacks right
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
      if (unstable_instant) {
        changeRoute(route, {
          shouldScroll: scroll ?? shouldScrollByDefault(url),
          push: true,
          url,
          instant: true,
        }).catch(() => {});
      } else {
        startTransitionFn(async () => {
          await changeRoute(route, {
            shouldScroll: scroll ?? shouldScrollByDefault(url),
            push: true,
            url,
          });
        });
      }
    } else if (url.hash && scroll !== false) {
      scrollToRoute(parseRoute(url), 'auto', false);
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

const MAX_FOLLOW_HOPS = 20;

const FollowError = ({
  error,
  has404,
  reset,
  fail,
  countHop,
  followPromiseMap,
}: {
  error: unknown;
  has404: boolean;
  reset: () => void;
  fail: (original: unknown, error: unknown) => void;
  countHop: () => number;
  followPromiseMap: WeakMap<object, Promise<unknown>>;
}) => {
  const { route, nav, changeRoute } = useRouterOrThrow();
  const { path: routePath, query: routeQuery } = route;
  const caughtAtRef = useRef<readonly [string, string] | undefined>(undefined);
  if (caughtAtRef.current === undefined) {
    caughtAtRef.current = [routePath, routeQuery];
  }
  const dispatchedRef = useRef<readonly [string, string] | undefined>(
    undefined,
  );
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);
  useEffect(() => {
    const [caughtPath, caughtQuery] = caughtAtRef.current!;
    // a route change means the followed slot is committed; safe to reset
    if (routePath !== caughtPath || routeQuery !== caughtQuery) {
      reset();
      return;
    }
    const dispatched = dispatchedRef.current;
    if (
      dispatched &&
      nav?.attempted[0] === dispatched[0] &&
      nav?.attempted[1] === dispatched[1]
    ) {
      if (dispatched[0] === routePath && dispatched[1] === routeQuery) {
        // the follow bounced back to the rendered route; it can render
        reset();
      } else {
        // the followed navigation committed without moving the route: a loop
        fail(error, new Error('detected a redirect loop', { cause: error }));
      }
    }
  }, [routePath, routeQuery, nav, reset, fail, error]);
  useEffect(() => {
    const info = getErrorInfo(error);
    // the attempted url may not have reached the address bar yet
    const attemptedUrl = navRef.current
      ? new URL(navRef.current.url, window.location.href)
      : new URL(window.location.href);
    let target: RouteProps;
    let url: URL;
    if (info?.location) {
      const parsed = parseRedirectUrl(info.location, attemptedUrl);
      if (!parsed) {
        return;
      }
      if (parsed.origin !== window.location.origin) {
        window.location.replace(parsed.href);
        return;
      }
      target = parseRoute(parsed);
      url = parsed;
    } else if (info?.status === 404 && has404) {
      target = { path: '/404', query: '', hash: '' };
      // the 404 route renders while the url keeps the attempted location
      url = attemptedUrl;
    } else {
      return;
    }
    if (followPromiseMap.has(error as object)) {
      return;
    }
    // redirecting back to the route the error came from cannot recover
    const caught = parseRoute(attemptedUrl);
    if (isSameRoute(target, caught)) {
      fail(error, new Error('detected a redirect loop', { cause: error }));
      return;
    }
    if (countHop() > MAX_FOLLOW_HOPS) {
      fail(
        error,
        new Error('too many redirect or 404 follows', { cause: error }),
      );
      return;
    }
    dispatchedRef.current = [target.path, target.query];
    startTransition(() => {
      followPromiseMap.set(
        error as object,
        changeRoute(target, {
          shouldScroll:
            navRef.current?.scrollIntent ?? target.path !== caught.path,
          url,
        }).then(
          (followable) => {
            if (followable !== undefined) {
              fail(error, followable);
            }
          },
          (err) => {
            fail(error, err);
          },
        ),
      );
    });
  }, [error, has404, fail, countHop, changeRoute, followPromiseMap]);
  const info = getErrorInfo(error);
  return info?.status === 404 && !has404 ? <h1>Not Found</h1> : null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
  private followPromiseMap = new WeakMap<object, Promise<unknown>>();
  private followHops = 0;
  constructor(props: { has404: boolean; children?: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
    this.fail = this.fail.bind(this);
    this.countHop = this.countHop.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  countHop() {
    this.followHops += 1;
    return this.followHops;
  }
  // a clean commit settles the chain; a rendering cycle would keep the count
  componentDidUpdate() {
    if (this.state.error === null) {
      this.followHops = 0;
    }
  }
  fail(original: unknown, error: unknown) {
    this.setState((state) => (state.error === original ? { error } : null));
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      const info = getErrorInfo(error);
      if (info?.status === 404 || info?.location) {
        return (
          <FollowError
            error={error}
            has404={this.props.has404}
            reset={this.reset}
            fail={this.fail}
            countHop={this.countHop}
            followPromiseMap={this.followPromiseMap}
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

// in flight slice fetches; the refetch identity scopes them per Root
const fetchingSlicesMap = new WeakMap<object, Set<SliceId>>();
const getFetchingSlices = (refetch: object): Set<SliceId> => {
  let set = fetchingSlicesMap.get(refetch);
  if (!set) {
    set = new Set();
    fetchingSlicesMap.set(refetch, set);
  }
  return set;
};

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
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    const fetchingSlices = getFetchingSlices(refetch);
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
  }, [refetch, id, needsToFetchSlice]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}

const getHashElement = (hash: string): HTMLElement | null => {
  const raw = hash.slice(1);
  const rawElement = document.getElementById(raw);
  if (rawElement) {
    return rawElement;
  }
  try {
    return document.getElementById(decodeURIComponent(raw));
  } catch {
    return null;
  }
};

const scrollToRoute = (
  route: RouteProps,
  behavior: ScrollBehavior,
  scrollTopForMissingHash: boolean,
) => {
  if (route.hash) {
    const element = getHashElement(route.hash);
    if (!element) {
      if (!scrollTopForMissingHash) {
        return;
      }
      window.scrollTo({
        left: 0,
        top: 0,
        behavior,
      });
      return;
    }
    const scrollMarginTop =
      Number.parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0;
    window.scrollTo({
      left: 0,
      top:
        element.getBoundingClientRect().top + window.scrollY - scrollMarginTop,
      behavior,
    });
    return;
  }
  window.scrollTo({
    left: 0,
    top: 0,
    behavior,
  });
};

const defaultRouteInterceptor = (route: RouteProps) => route;

const InnerRouter = ({
  fallbackRoute,
  routeInterceptor = defaultRouteInterceptor,
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
  const initialHash = useRef(resolvedRoute.hash).current;
  const initialRoute = useRef({ ...resolvedRoute, hash: '' }).current;

  // meta keys persist across merges, so they read from the current elements
  const has404 = has404FromElements(elements);
  const staticPathSet = useRef(new Set<string>()).current;
  const resolvedElementsRef = useRef(elements);
  useEffect(() => {
    resolvedElementsRef.current = elements;
    const route = getRouteFromElements(elements);
    if (route && isStaticFromElements(elements)) {
      staticPathSet.add(route.path);
    }
  }, [elements, staticPathSet]);
  const prefetchManager = useRef(createPrefetchManager()).current;

  const refetch = useRefetch();
  const mergeElements = useMergeElements();
  const [err, setErr] = useState<unknown>(null);
  // the hash appears after hydration; an empty one bails out, leaving
  // hydrating suspense boundaries undisturbed
  const [restoredHash, setRestoredHash] = useState('');
  useEffect(() => {
    setRestoredHash(window.location.hash || initialHash);
  }, [initialHash]);

  const derived = deriveCommitted(elements, initialRoute);
  const { nav, url: committedUrl } = derived;
  const currentRoute = nav
    ? derived.route
    : { ...derived.route, hash: restoredHash };
  const routeRef = useRef(currentRoute);
  const reconciledRef = useRef<{ nav: NavState; href: string } | undefined>(
    undefined,
  );
  useLayoutEffect(() => {
    routeRef.current = currentRoute;
    if (!nav || !committedUrl) {
      return;
    }
    const navChanged = nav !== reconciledRef.current?.nav;
    if (!navChanged && committedUrl.href === reconciledRef.current?.href) {
      return;
    }
    reconciledRef.current = { nav, href: committedUrl.href };
    if (nav.push && window.location.href !== committedUrl.href) {
      nav.push = false; // consumed, so a later commit does not push again
      window.history.pushState(window.history.state, '', committedUrl);
    } else {
      window.history.replaceState(window.history.state, '', committedUrl);
    }
    if (nav.scroll) {
      const scroll = nav.scroll;
      nav.scroll = null; // consumed, so a later commit does not scroll again
      scrollToRoute(
        currentRoute,
        scroll.pathChanged ? 'instant' : 'auto',
        scroll.pathChanged,
      );
    }
  });

  if (import.meta.hot) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const refetchRoute = () => {
        prefetchManager.clear();
        staticPathSet.clear();
        const route = routeRef.current;
        startTransition(() => {
          void refetch(
            encodeRoutePath(route.path),
            createRscParams(route.query),
          );
        });
      };
      upsertRscReloadListener(globalThis.__WAKU_REFETCH_ROUTE__, refetchRoute);
      globalThis.__WAKU_REFETCH_ROUTE__ = refetchRoute;
    }, [refetch, prefetchManager, staticPathSet]);
  }

  const [[routeChangeEvents, emitRouteChangeEvent]] = useState(
    createRouteChangeListeners,
  );

  const abortRef = useRef<AbortController | null>(null);

  const changeRoute: ChangeRoute = useCallback(
    async (nextRoute, options) => {
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      const isAborted = () => abortController.signal.aborted;
      emitRouteChangeEvent('start', nextRoute);
      const routeBefore = routeRef.current;
      const targetUrl = options.url ?? getRouteUrl(nextRoute);
      const navState = makeNavState(nextRoute, targetUrl, {
        push: !!options.push,
        scroll: options.shouldScroll,
        pathChanged: nextRoute.path !== routeBefore.path,
      });
      const shouldRefetch =
        options.refetch ?? !isSameRoute(nextRoute, routeBefore);
      setErr(null);
      if (staticPathSet.has(nextRoute.path) || !shouldRefetch) {
        mergeElements({
          [ROUTE_ID]: [nextRoute.path, nextRoute.query],
          [NAV_ID]: navState,
        });
        abortRef.current = null;
        emitRouteChangeEvent('complete', nextRoute);
        return;
      }
      const rscPath = encodeRoutePath(nextRoute.path);
      const cached = prefetchManager.get(rscPath, nextRoute.query);
      const prefetchedElements = prefetchManager.getElements(rscPath);
      const instant =
        options.instant &&
        canCommitInstantly(
          getRouteSlotId(nextRoute.path),
          resolvedElementsRef.current,
          prefetchedElements,
        );
      const dataPromise = refetch(rscPath, createRscParams(nextRoute.query), {
        signal: abortController.signal,
        unstable_overlay: {
          [NAV_ID]: navState,
          // instant nav paints from the cache, so route meta comes with it
          ...(instant ? { [ROUTE_ID]: [nextRoute.path, nextRoute.query] } : {}),
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
        if (isAborted()) {
          return;
        }
        abortRef.current = null;
        emitRouteChangeEvent(
          'complete',
          getServerRedirect(resolved, nextRoute) ?? nextRoute,
        );
      } catch (e) {
        if (isAborted()) {
          return;
        }
        abortRef.current = null;
        const info = getErrorInfo(e);
        if (info?.location) {
          // a fetch level redirect may leave waku; the browser follows it
          const url = new URL(info.location, targetUrl);
          if (navState.push) {
            window.location.assign(url.href);
          } else {
            window.location.replace(url.href);
          }
          return;
        }
        if (!info && e instanceof TypeError) {
          // a probe tells a dead server from a cors blocked redirect
          const alive = await fetch(targetUrl, {
            method: 'HEAD',
            redirect: 'manual',
          }).then(
            () => true,
            () => false,
          );
          if (isAborted()) {
            return;
          }
          if (alive) {
            // the browser retries the url itself and follows any redirect
            if (navState.push) {
              window.location.assign(targetUrl.href);
            } else {
              window.location.replace(targetUrl.href);
            }
            return;
          }
        }
        // write the url now; an unrecoverable rethrow discards the commit
        if (window.location.href !== targetUrl.href) {
          if (navState.push) {
            window.history.pushState(window.history.state, '', targetUrl);
          } else {
            window.history.replaceState(window.history.state, '', targetUrl);
          }
        }
        mergeElements({
          [NAV_ID]: {
            ...navState,
            push: false,
            scroll: null,
            scrollIntent: options.shouldScroll,
            attempted: [routeBefore.path, routeBefore.query],
          },
        });
        setErr(e);
        if (info?.status === 404 && has404) {
          // a followable outcome; the boundary takes it from here
          return e;
        }
        throw e;
      }
    },
    [
      refetch,
      mergeElements,
      has404,
      emitRouteChangeEvent,
      staticPathSet,
      resolvedElementsRef,
      prefetchManager,
    ],
  );

  const applyChangeRouteData = useCallback(
    async (routeData: unknown, isStatic: unknown) => {
      if (!routeData) {
        return;
      }
      const [path, query] = routeData as [string, string];
      const currentRoute = routeRef.current;
      if (
        currentRoute.path === path &&
        (isStatic || currentRoute.query === query)
      ) {
        return;
      }
      const route = { path, query, hash: '' };
      await changeRouteInTransition(changeRoute, route, {
        refetch: false,
        shouldScroll: false,
        push: path !== '/404',
        url: getRouteUrl(route),
      });
    },
    [changeRoute],
  );
  useEffect(() => {
    const listener = (elements: Record<string, unknown>) => {
      const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = elements;
      applyChangeRouteData(routeData, isStatic).catch((err) => {
        console.log('Error while handling route updates:', err);
      });
    };
    return registerCallServerElementsListener(listener);
  }, [applyChangeRouteData]);

  const prefetchRoute: PrefetchRoute = useCallback(
    (route, options) => {
      preloadRouteModules(route.path);
      if (staticPathSet.has(route.path)) {
        return;
      }
      const rscPath = encodeRoutePath(route.path);
      prefetchManager.prefetch(
        rscPath,
        route.query,
        (base) =>
          prefetchRsc(rscPath, createRscParams(route.query), {
            ...(base ? { unstable_base: base } : {}),
          }),
        options,
      );
    },
    [staticPathSet, prefetchManager],
  );

  useEffect(() => {
    const callback = () => {
      const nextRoute = routeInterceptor(parseRouteFromLocation());
      if (!nextRoute) {
        return;
      }
      startTransition(() => {
        changeRoute(nextRoute, {
          shouldScroll: shouldScrollForRouteChange(nextRoute, routeRef.current),
        }).catch((err) => {
          console.log('Error while navigating back:', err);
        });
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute, routeInterceptor]);

  const routeElement =
    err !== null ? (
      <ThrowError error={err} />
    ) : (
      <Slot id={getRouteSlotId(currentRoute.path)} />
    );
  const rootElement = (
    <Slot id="root">
      <CustomErrorHandler has404={has404}>{routeElement}</CustomErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route: currentRoute,
        nav,
        changeRoute,
        prefetchRoute,
        routeChangeEvents,
      }}
    >
      {rootElement}
    </RouterContext>
  );
};

export function Router({
  initialRoute = parseRouteFromLocation(),
  unstable_routeInterceptor,
}: {
  initialRoute?: RouteProps;
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

const MOCK_ROUTE_CHANGE_LISTENER: Record<
  'on' | 'off',
  (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
> = {
  on: () => notAvailableInServer('routeChange:on'),
  off: () => notAvailableInServer('routeChange:off'),
};

/**
 * ServerRouter for SSR
 * This is not a public API.
 */
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
          routeChangeEvents: MOCK_ROUTE_CHANGE_LISTENER,
        }}
      >
        {rootElement}
      </RouterContext>
    </>
  );
}

// Expose internal APIs
// Subject to change without notice
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
export type Unstable_ChangeRouteEvent = ChangeRouteEvent;
export type Unstable_ChangeRouteCallback = ChangeRouteCallback;
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
