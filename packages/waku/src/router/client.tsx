'use client';

import {
  Component,
  createContext,
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
  applyServerRedirect,
  canCommitInstantly,
  deriveNav,
  getRouteUrl,
  isSameRoute,
  parseRoute,
  pathnameToCurrentRoutePath,
  pinForSwr,
  resolveFollowingErrors,
  writeUrlToHistory,
} from './client-utils/navigate.js';
import type { Destination, Nav } from './client-utils/navigate.js';
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
  mode?: undefined | 'push' | 'replace';
  url?: URL | undefined;
  startTransition?: ((fn: TransitionFunction) => void) | undefined;
  instant?: boolean | undefined;
  errorToFollow?: unknown;
};

type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

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
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  routeChangeEvents: Record<
    'on' | 'off',
    (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
  >;
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
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        mode: 'push',
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
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        mode: 'replace',
        url,
        instant: options?.unstable_instant,
      });
    },
    [changeRoute, resolveCodec],
  ) as Navigate;
  const reload = useCallback(async () => {
    await changeRoute(parseRouteFromLocation(), {
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
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? false,
        mode: options?.history ?? 'push',
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
          mode: 'push',
          url,
          instant: true,
        }).catch(() => {});
      } else {
        startTransitionFn(async () => {
          await changeRoute(route, {
            shouldScroll: scroll ?? shouldScrollByDefault(url),
            mode: 'push',
            url,
            startTransition: startTransitionFn,
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

const FollowError = ({
  error,
  has404,
  reset,
  fail,
  followPromiseMap,
}: {
  error: unknown;
  has404: boolean;
  reset: () => void;
  fail: (original: unknown, error: unknown) => void;
  followPromiseMap: WeakMap<object, Promise<unknown>>;
}) => {
  const { route, changeRoute } = useRouterOrThrow();
  const routeAtCatchRef = useRef(route);
  useEffect(() => {
    // reset once the followed route commits; a revived error follows again
    if (!isSameRoute(route, routeAtCatchRef.current)) {
      followPromiseMap.delete(error as object);
      reset();
    }
  }, [route, error, reset, followPromiseMap]);
  useEffect(() => {
    const info = getErrorInfo(error);
    if (!info?.location && !(info?.status === 404 && has404)) {
      return;
    }
    if (
      !isSameRoute(route, routeAtCatchRef.current) ||
      followPromiseMap.has(error as object)
    ) {
      return;
    }
    followPromiseMap.set(
      error as object,
      changeRoute(parseRouteFromLocation(), {
        shouldScroll: true,
        errorToFollow: error,
        ...(info?.location ? { mode: 'replace' as const } : {}),
      }).catch((err) => {
        followPromiseMap.delete(error as object);
        fail(error, err);
      }),
    );
  }, [route, error, has404, changeRoute, fail, followPromiseMap]);
  const info = getErrorInfo(error);
  return info?.status === 404 && !has404 ? <h1>Not Found</h1> : null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
  private followPromiseMap = new WeakMap<object, Promise<unknown>>();
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
  const router = useRouterOrThrow();
  const { fetchingSlices } = router;
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    // FIXME this works because of subtle timing behavior.
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
  const initialRoute = useRef(resolvedRoute).current;

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
  // FIXME this "fetchingSlices" hack feels suboptimal.
  const fetchingSlices = useRef(new Set<SliceId>()).current;
  const prefetchManager = useRef(createPrefetchManager()).current;

  const refetch = useRefetch();
  const mergeElements = useMergeElements();
  const [nav, setNav] = useState<Nav>(() => ({
    query: initialRoute.query,
    // hydrate without the hash the server does not know; an effect restores it
    hash: '',
    history: null,
    scroll: null,
  }));
  const [err, setErr] = useState<unknown>(null);
  const currentRoute: RouteProps = {
    path: routeFromElements ? routeFromElements.path : initialRoute.path,
    query: nav.query,
    hash: nav.hash,
  };
  const routeRef = useRef(currentRoute);
  useEffect(() => {
    const hash = window.location.hash || initialRoute.hash;
    routeRef.current = { ...routeRef.current, hash };
    setNav((prev) =>
      prev.hash === hash && !prev.history && !prev.scroll
        ? prev
        : { ...prev, hash, history: null, scroll: null },
    );
    setErr(null);
  }, [initialRoute.hash]);
  useLayoutEffect(() => {
    const route = routeRef.current;
    if (nav.history) {
      writeUrlToHistory(
        nav.history.mode,
        nav.history.url || getRouteUrl(route),
      );
    }
    if (nav.scroll) {
      scrollToRoute(
        route,
        nav.scroll.pathChanged ? 'instant' : 'auto',
        nav.scroll.pathChanged,
      );
    }
  }, [nav]);

  if (import.meta.hot) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const refetchRoute = () => {
        prefetchManager.clear();
        staticPathSet.clear();
        const route = routeRef.current;
        void refetch(encodeRoutePath(route.path), createRscParams(route.query));
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
      const startTransitionFn =
        options.startTransition || ((fn: TransitionFunction) => fn());
      const prevPathname = window.location.pathname;
      let mode = options.mode;
      const routeBefore = routeRef.current;
      const shouldRefetch =
        options.refetch ?? !isSameRoute(nextRoute, routeBefore);
      const targetUrl = options.url ?? getRouteUrl(nextRoute);
      const resolveDeps = {
        fetchRoute: (route: RouteProps, routeUrl: URL) => {
          const rscPath = encodeRoutePath(route.path);
          const cached = prefetchManager.get(rscPath, route.query);
          return refetch(rscPath, createRscParams(route.query), {
            signal: abortController.signal,
            onBuildIdMismatch: () => reloadWithUrl(routeUrl),
            ...(cached ? { unstable_prefetched: cached.promise } : {}),
          });
        },
        isKnownStatic: (path: string) => staticPathSet.has(path),
        has404,
        isAborted,
        leaveApp: (url: URL) => {
          if (mode && window.location.href !== targetUrl.href) {
            writeUrlToHistory(mode, targetUrl);
            setNav((prev) => ({ ...prev, history: null }));
          }
          window.location.replace(url.href);
        },
      };
      const finish = (destination: Destination) => {
        if (isAborted()) {
          return;
        }
        const { route, nav: nextNav } = deriveNav({
          destination,
          attempted: nextRoute,
          routeBefore,
          history: mode,
          historyUrl: options.url,
          shouldScroll: options.errorToFollow
            ? destination.route.path !== routeBefore.path
            : options.shouldScroll,
          getServerRedirect,
        });
        if (
          options.errorToFollow !== undefined &&
          isSameRoute(route, routeBefore)
        ) {
          throw new Error('detected a redirect loop', {
            cause: options.errorToFollow,
          });
        }
        const commit = () => {
          if (!destination.elements) {
            mergeElements({ [ROUTE_ID]: [route.path, route.query] });
          }
          routeRef.current = route;
          if (options.errorToFollow && nextNav.history) {
            writeUrlToHistory(
              nextNav.history.mode,
              nextNav.history.url || getRouteUrl(route),
            );
            setNav({ ...nextNav, history: null });
          } else {
            setNav(nextNav);
          }
          setErr(null);
          abortRef.current = null;
          emitRouteChangeEvent('complete', route);
        };
        if (isSameRoute(destination.route, nextRoute)) {
          void startTransitionFn(commit);
        } else {
          commit();
        }
      };
      if (
        !options.errorToFollow &&
        (staticPathSet.has(nextRoute.path) || !shouldRefetch)
      ) {
        finish({ route: nextRoute, routeUrl: targetUrl });
        return;
      }
      if (!options.errorToFollow && options.instant) {
        const rscPath = encodeRoutePath(nextRoute.path);
        const prefetchedElements = prefetchManager.getElements(rscPath);
        const routeSlotId = getRouteSlotId(nextRoute.path);
        if (
          canCommitInstantly(
            routeSlotId,
            resolvedElementsRef.current,
            prefetchedElements,
          )
        ) {
          const pin = pinForSwr(() => resolvedElementsRef.current);
          const cached = prefetchManager.get(rscPath, nextRoute.query);
          const dataPromise = refetch(
            rscPath,
            createRscParams(nextRoute.query),
            {
              signal: abortController.signal,
              unstable_overlay: {
                [ROUTE_ID]: [nextRoute.path, nextRoute.query],
              },
              unstable_swr: {
                pin,
                ...(prefetchedElements ? { base: prefetchedElements } : {}),
              },
              onBuildIdMismatch: () => reloadWithUrl(targetUrl),
              ...(cached ? { unstable_prefetched: cached.promise } : {}),
            },
          );
          routeRef.current = nextRoute;
          // instant nav paints the target right away, so write its url now
          const optimisticNav = deriveNav({
            destination: { route: nextRoute, routeUrl: targetUrl },
            attempted: nextRoute,
            routeBefore,
            history: mode,
            historyUrl: options.url,
            shouldScroll: options.shouldScroll,
            getServerRedirect,
          }).nav;
          if (optimisticNav.history) {
            writeUrlToHistory(
              optimisticNav.history.mode,
              optimisticNav.history.url || getRouteUrl(nextRoute),
            );
          }
          setNav({ ...optimisticNav, history: null });
          setErr(null);
          try {
            const elements = await dataPromise;
            if (isAborted()) {
              return;
            }
            const redirect = getServerRedirect(elements, nextRoute);
            if (redirect) {
              routeRef.current = redirect;
              if (redirect.path !== '/404') {
                writeUrlToHistory('replace', getRouteUrl(redirect));
              }
              setNav((prev) => ({
                ...applyServerRedirect(prev, redirect),
                history: null,
              }));
            }
            abortRef.current = null;
            emitRouteChangeEvent('complete', redirect ?? nextRoute);
          } catch (e) {
            if (isAborted()) {
              return;
            }
            // the url was already written optimistically, so a follow replaces
            mode = mode && 'replace';
            try {
              const destination = await resolveFollowingErrors(
                resolveDeps,
                nextRoute,
                targetUrl,
                routeBefore,
                e,
              );
              if (destination) {
                finish(destination);
              }
            } catch (e2) {
              if (isAborted()) {
                return;
              }
              setErr(e2);
              abortRef.current = null;
              throw e2;
            }
          }
          return;
        }
      }
      try {
        const destination = await resolveFollowingErrors(
          resolveDeps,
          nextRoute,
          targetUrl,
          routeBefore,
          options.errorToFollow,
        );
        if (!destination) {
          return;
        }
        finish(destination);
      } catch (e) {
        if (isAborted()) {
          return;
        }
        // Write URL synchronously
        // React may rollback transition state updates when the render throws
        if (mode && window.location.pathname === prevPathname) {
          writeUrlToHistory(mode, targetUrl);
        }
        setErr(e);
        abortRef.current = null;
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
      await changeRoute(route, {
        refetch: false,
        shouldScroll: false,
        mode: path === '/404' ? undefined : 'push',
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
      changeRoute(nextRoute, {
        shouldScroll: shouldScrollForRouteChange(nextRoute, routeRef.current),
      }).catch((err) => {
        console.log('Error while navigating back:', err);
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
        changeRoute,
        prefetchRoute,
        routeChangeEvents,
        fetchingSlices,
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
          fetchingSlices: new Set<SliceId>(),
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
