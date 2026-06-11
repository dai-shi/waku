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
import { getErrorInfo } from '../lib/utils/custom-errors.js';
import { addBase, removeBase } from '../lib/utils/path.js';
import {
  Root,
  Slot,
  unstable_prefetchRsc as prefetchRsc,
  unstable_registerCallServerElementsListener as registerCallServerElementsListener,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRscStore_UNSTABLE as useFetchRscStore,
  useRefetch,
  unstable_withBuildIdMismatchHandler as withBuildIdMismatchHandler,
  unstable_withEnhanceFetchFn as withEnhanceFetchFn,
} from '../minimal/client.js';
import type { RouteConfig } from './base-types.js';
import {
  ETAG_ID_PREFIX,
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  SKIP_HEADER,
  encodeRoutePath,
  encodeSliceId,
  pathnameToRoutePath,
} from './common.js';
import type { RouteProps } from './common.js';

type AllowTrailingSlash<Path extends string> = Path extends '/'
  ? Path
  : Path | `${Path}/`;

type AllowPathDecorators<Path extends string> = Path extends unknown
  ?
      | AllowTrailingSlash<Path>
      | `${AllowTrailingSlash<Path>}?${string}`
      | `${AllowTrailingSlash<Path>}#${string}`
      | `?${string}`
      | `#${string}`
  : never;

type InferredPaths = RouteConfig extends {
  paths: infer UserPaths extends string;
}
  ? AllowPathDecorators<UserPaths>
  : string;

const pathnameToCurrentRoutePath = (pathname: string) =>
  pathnameToRoutePath(
    removeBase(pathname, import.meta.env.WAKU_CONFIG_BASE_PATH),
  );

const parseRoute = (url: URL): RouteProps => {
  const { pathname, searchParams, hash } = url;
  return {
    path: pathnameToCurrentRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
};

const getRouteUrl = (route: RouteProps): URL => {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = route.path;
  nextUrl.search = route.query;
  nextUrl.hash = route.hash;
  return nextUrl;
};

const parseRouteFromLocation = (): RouteProps => {
  return parseRoute(new URL(window.location.href));
};

const getRouteFromElements = (
  elements: Record<string, unknown>,
): RouteProps | undefined => {
  const routeData = elements[ROUTE_ID];
  if (routeData) {
    const [path, query] = routeData as [string, string];
    return { path, query, hash: '' };
  }
  return undefined;
};

const shouldScrollByDefault = (url: URL) =>
  pathnameToCurrentRoutePath(url.pathname) !==
    pathnameToCurrentRoutePath(window.location.pathname) ||
  url.hash !== window.location.hash;

const isPathChange = (next: RouteProps, prev: RouteProps) =>
  next.path !== prev.path;

const isHashChange = (next: RouteProps, prev: RouteProps) =>
  next.hash !== prev.hash;

const isSameRoute = (next: RouteProps, prev: RouteProps) =>
  next.path === prev.path &&
  next.query === prev.query &&
  next.hash === prev.hash;

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
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
};

type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

type ChangeRouteEvent = 'start' | 'complete';

type ChangeRouteCallback = (route: RouteProps) => void;

type PrefetchRoute = (route: RouteProps) => void;

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

export function useRouter() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }

  const { route, changeRoute, prefetchRoute } = router;
  const push = useCallback(
    async (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path/hash change (not on query-only change)
         */
        scroll?: boolean;
      },
    ) => {
      to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
      const url = new URL(to, window.location.href);
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        mode: 'push',
        url,
      });
    },
    [changeRoute],
  );
  const replace = useCallback(
    async (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path/hash change (not on query-only change)
         */
        scroll?: boolean;
      },
    ) => {
      to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
      const url = new URL(to, window.location.href);
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        mode: 'replace',
        url,
      });
    },
    [changeRoute],
  );
  const reload = useCallback(async () => {
    const url = new URL(window.location.href);
    await changeRoute(parseRoute(url), { shouldScroll: true, refetch: true });
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
    (to: string) => {
      const url = new URL(to, window.location.href);
      prefetchRoute(parseRoute(url));
    },
    [prefetchRoute],
  );
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

export type LinkProps = {
  to: InferredPaths;
  children: ReactNode;
  /**
   * indicates if the link should scroll or not on navigation
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change or repeated same-hash click (not query-only)
   */
  scroll?: boolean;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
  /**
   * Overrides how the navigation transition is started, e.g. to integrate the
   * browser View Transitions API. When provided, React's `useTransition` is
   * bypassed, so `useNavigationStatus_UNSTABLE()` stays `{ pending: false }` for
   * this link.
   */
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  scroll,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  ref: refProp,
  ...props
}: LinkProps): ReactElement {
  const resolvedTo = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
  const router = useContext(RouterContext);
  const changeRoute = router
    ? router.changeRoute
    : () => {
        throw new Error('Missing Router');
      };
  const prefetchRoute = router
    ? router.prefetchRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const startTransitionFn = unstable_startTransition || startTransition;
  const [ref, setRef] = useSharedRef<HTMLAnchorElement>(refProp);

  useEffect(() => {
    if (!unstable_prefetchOnView || !ref.current) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const url = new URL(resolvedTo, window.location.href);
            if (router && url.href !== window.location.href) {
              router.prefetchRoute(parseRoute(url));
            }
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [unstable_prefetchOnView, router, resolvedTo, ref]);
  const internalOnClick = () => {
    const url = new URL(resolvedTo, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      prefetchRoute(route);
      startTransitionFn(async () => {
        await changeRoute(route, {
          shouldScroll: scroll ?? shouldScrollByDefault(url),
          mode: 'push',
          url,
          unstable_startTransition: startTransitionFn,
        });
      });
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
    if (props.download != null && props.download !== false) {
      console.warn(
        '[Link] `download` is discouraged. Use `<a>` for this case.',
      );
    }
    event.preventDefault();
    internalOnClick();
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        const url = new URL(resolvedTo, window.location.href);
        if (url.href !== window.location.href) {
          prefetchRoute(parseRoute(url));
        }
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

const NotFound = ({
  error,
  has404,
  reset,
  handledErrorSet,
}: {
  error: unknown;
  has404: boolean;
  reset: () => void;
  handledErrorSet: WeakSet<object>;
}) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    if (has404) {
      if (handledErrorSet.has(error as object)) {
        return;
      }
      handledErrorSet.add(error as object);
      const url = new URL('/404', window.location.href);
      changeRoute(parseRoute(url), { shouldScroll: true })
        .then(() => {
          reset();
        })
        .catch((err) => {
          console.log('Error while navigating to 404:', err);
        });
    }
  }, [error, has404, reset, changeRoute, handledErrorSet]);
  return has404 ? null : <h1>Not Found</h1>;
};

const Redirect = ({
  error,
  to,
  reset,
  handledErrorSet,
}: {
  error: unknown;
  to: string;
  reset: () => void;
  handledErrorSet: WeakSet<object>;
}) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    // ensure single re-fetch per server redirection error on StrictMode
    // https://github.com/wakujs/waku/pull/1512
    if (handledErrorSet.has(error as object)) {
      return;
    }
    handledErrorSet.add(error as object);

    const url = new URL(to, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }
    if (url.hostname !== window.location.hostname) {
      window.location.replace(url.href);
      return;
    }
    const currentPath = window.location.pathname;
    const newPath = url.pathname !== currentPath;
    const historyUrl = url.origin === window.location.origin ? url : undefined;
    changeRoute(parseRoute(url), {
      shouldScroll: newPath,
      mode: 'replace',
      url: historyUrl,
    })
      .then(() => {
        handledErrorSet.delete(error as object);
        // FIXME: As we understand it, we should have a proper solution.
        setTimeout(() => {
          reset();
        }, 1);
      })
      .catch((err) => {
        handledErrorSet.delete(error as object);
        console.log('Error while navigating to redirect:', err);
      });
  }, [error, to, reset, changeRoute, handledErrorSet]);
  return null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
  private handledErrorSet = new WeakSet();
  constructor(props: { has404: boolean; children?: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      const info = getErrorInfo(error);
      if (info?.status === 404) {
        return (
          <NotFound
            error={error}
            has404={this.props.has404}
            reset={this.reset}
            handledErrorSet={this.handledErrorSet}
          />
        );
      }
      if (info?.location) {
        return (
          <Redirect
            error={error}
            to={info.location}
            reset={this.reset}
            handledErrorSet={this.handledErrorSet}
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

const getRouteSlotId = (path: string) => 'route:' + path;
const getSliceSlotId = (id: SliceId) => 'slice:' + id;

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
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { fetchingSlices } = router;
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) ||
      // FIXME: hard-coded for now
      elements[IS_STATIC_ID + ':' + slotId] !== true);
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

const writeUrlToHistory = (mode: 'push' | 'replace', url: URL) => {
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url);
  } else {
    window.history.replaceState(window.history.state, '', url);
  }
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
  const initialRouteRef = useRef(resolvedRoute);

  if (import.meta.hot) {
    const refetchRoute = () => {
      staticPathSetRef.current.clear();
      cachedEtagsRef.current = {};
      const rscPath = encodeRoutePath(route.path);
      const rscParams = createRscParams(route.query);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      refetch(rscPath, rscParams);
    };
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
    const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
      globalThis.__WAKU_REFETCH_ROUTE__!,
    );
    if (index !== -1) {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRoute);
    } else {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.unshift(refetchRoute);
    }
    globalThis.__WAKU_REFETCH_ROUTE__ = refetchRoute;
  }

  const [has404, setHas404] = useState(false);
  const staticPathSetRef = useRef(new Set<string>());
  const cachedEtagsRef = useRef<Record<string, string>>({});
  // FIXME this "fetchingSlices" hack feels suboptimal.
  const fetchingSlicesRef = useRef(new Set<SliceId>());
  useEffect(() => {
    elementsPromise.then(
      (elements) => {
        const {
          [ROUTE_ID]: routeData,
          [IS_STATIC_ID]: isStatic,
          [HAS404_ID]: has404FromElements,
        } = elements;
        if (has404FromElements) {
          setHas404(true);
        }
        if (routeData) {
          const [path, _query] = routeData as [string, string];
          if (isStatic) {
            staticPathSetRef.current.add(path);
          }
        }
        const etags: Record<string, string> = {};
        for (const [key, value] of Object.entries(elements)) {
          // Drop empty (clear signal) and non-Latin1 (breaks fetch) tags.
          if (
            key.startsWith(ETAG_ID_PREFIX) &&
            typeof value === 'string' &&
            /^[\u0020-\u00ff]+$/.test(value)
          ) {
            etags[key.slice(ETAG_ID_PREFIX.length)] = value;
          }
        }
        cachedEtagsRef.current = etags;
      },
      () => {},
    );
  }, [elementsPromise]);

  const refetch = useRefetch();
  const [route, setRoute] = useState(() => ({
    // This is the first initialization of the route, and it has
    // to ignore the hash, because on server side there is none.
    // Otherwise there will be a hydration error.
    // The client side route, including the hash, will be updated in the effect below.
    ...initialRouteRef.current,
    hash: '',
  }));
  const routeChangeListenersRef = useRef<ReturnType<
    typeof createRouteChangeListeners
  > | null>(null);
  if (routeChangeListenersRef.current === null) {
    routeChangeListenersRef.current = createRouteChangeListeners();
  }
  // Update the route post-load to include the current hash.
  const routeRef = useRef(route);
  useEffect(() => {
    const route = {
      ...initialRouteRef.current,
      hash: window.location.hash || initialRouteRef.current.hash,
    };
    routeRef.current = route;
    setRoute((prev) => (isSameRoute(prev, route) ? prev : route));
    setErr(null);
    setPendingScroll(null);
    setPendingHistory(null);
  }, []);
  const [err, setErr] = useState<unknown>(null);
  const [pendingHistory, setPendingHistory] = useState<{
    mode: 'push' | 'replace';
    url: URL | undefined;
  } | null>(null);
  useLayoutEffect(() => {
    if (pendingHistory) {
      const { mode, url } = pendingHistory;
      const urlToWrite = url || getRouteUrl(route);
      writeUrlToHistory(mode, urlToWrite);
    }
  }, [route, pendingHistory]);
  const [pendingScroll, setPendingScroll] = useState<{
    pathChanged: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    if (pendingScroll) {
      const { pathChanged } = pendingScroll;
      const scrollBehavior: ScrollBehavior = pathChanged ? 'instant' : 'auto';
      scrollToRoute(route, scrollBehavior, pathChanged);
    }
  }, [route, pendingScroll]);
  // TODO(daishi): consider combining three or four useState hooks above.

  const [routeChangeEvents, emitRouteChangeEvent] =
    routeChangeListenersRef.current;
  const routeChangeAbortRef = useRef<AbortController | null>(null);
  const changeRoute: ChangeRoute = useCallback(
    async (nextRoute, options) => {
      routeChangeAbortRef.current?.abort();
      const abortController = new AbortController();
      routeChangeAbortRef.current = abortController;
      const isAborted = () => abortController.signal.aborted;
      emitRouteChangeEvent('start', nextRoute);
      const startTransitionFn =
        options.unstable_startTransition || ((fn: TransitionFunction) => fn());
      const prevPathname = window.location.pathname;
      let { mode, url } = options;
      const routeBeforeChange = routeRef.current;
      const shouldRefetch =
        options.refetch ?? !isSameRoute(nextRoute, routeBeforeChange);
      const pathChanged = isPathChange(nextRoute, routeBeforeChange);
      if (!staticPathSetRef.current.has(nextRoute.path) && shouldRefetch) {
        const rscPath = encodeRoutePath(nextRoute.path);
        const rscParams = createRscParams(nextRoute.query);
        const skipHeaderEnhancer =
          (fetchFn: typeof fetch) =>
          (input: RequestInfo | URL, init: RequestInit = {}) => {
            if (init.signal === undefined) {
              init.signal = abortController.signal;
            }
            const skipStr = JSON.stringify(cachedEtagsRef.current);
            const headers = (init.headers ||= {});
            if (Array.isArray(headers)) {
              headers.push([SKIP_HEADER, skipStr]);
            } else if (headers instanceof Headers) {
              headers.set(SKIP_HEADER, skipStr);
            } else {
              (headers as Record<string, string>)[SKIP_HEADER] = skipStr;
            }
            return fetchFn(input, init);
          };
        try {
          const targetUrl = url || getRouteUrl(nextRoute);
          const elements = await refetch(rscPath, rscParams, (store) =>
            withBuildIdMismatchHandler(() => {
              window.history.pushState(window.history.state, '', targetUrl);
              window.location.reload();
            })(withEnhanceFetchFn(skipHeaderEnhancer)(store)),
          );
          const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = elements;
          if (routeData) {
            const [path, query] = routeData as [string, string];
            if (
              nextRoute.path !== path ||
              (!isStatic && nextRoute.query !== query)
            ) {
              nextRoute = {
                path,
                query,
                hash: '',
              };
              if (mode) {
                mode = path === '/404' ? undefined : 'push';
                url = undefined;
              }
            }
          }
        } catch (e) {
          if (isAborted()) {
            return;
          }
          routeChangeAbortRef.current = null;
          // Write URL synchronously
          // React may rollback transition state updates when the render throws
          if (mode && window.location.pathname === prevPathname) {
            const urlToWrite = url || getRouteUrl(nextRoute);
            writeUrlToHistory(mode, urlToWrite);
          }
          setErr(e);
          throw e;
        }
      }
      if (isAborted()) {
        return;
      }
      startTransitionFn(() => {
        if (isAborted()) {
          return;
        }
        routeRef.current = nextRoute;
        setRoute(nextRoute);
        setErr(null);
        setPendingScroll(options.shouldScroll ? { pathChanged } : null);
        setPendingHistory(mode ? { mode, url } : null);
        routeChangeAbortRef.current = null;
        emitRouteChangeEvent('complete', nextRoute);
      });
    },
    [emitRouteChangeEvent, refetch],
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
      const url = new URL(window.location.href);
      url.pathname = path;
      url.search = query;
      url.hash = '';
      await changeRoute(parseRoute(url), {
        refetch: false,
        shouldScroll: false,
        mode: path === '/404' ? undefined : 'push',
        url,
      });
    },
    [changeRoute],
  );
  const fetchRscStore = useFetchRscStore();
  useEffect(() => {
    const listener = (elements: Record<string, unknown>) => {
      const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = elements;
      applyChangeRouteData(routeData, isStatic).catch((err) => {
        console.log('Error while handling route updates:', err);
      });
    };
    return registerCallServerElementsListener(fetchRscStore, listener);
  }, [applyChangeRouteData, fetchRscStore]);

  const prefetchRoute: PrefetchRoute = useCallback((route) => {
    if (staticPathSetRef.current.has(route.path)) {
      return;
    }
    const rscPath = encodeRoutePath(route.path);
    const rscParams = createRscParams(route.query);
    const skipHeaderEnhancer =
      (fetchFn: typeof fetch) =>
      (input: RequestInfo | URL, init: RequestInit = {}) => {
        const skipStr = JSON.stringify(cachedEtagsRef.current);
        const headers = (init.headers ||= {});
        if (Array.isArray(headers)) {
          headers.push([SKIP_HEADER, skipStr]);
        } else if (headers instanceof Headers) {
          headers.set(SKIP_HEADER, skipStr);
        } else {
          (headers as Record<string, string>)[SKIP_HEADER] = skipStr;
        }
        return fetchFn(input, init);
      };
    prefetchRsc(rscPath, rscParams, withEnhanceFetchFn(skipHeaderEnhancer));
    (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(route.path, (id: string) => {
      preloadModule(id, { as: 'script' });
    });
  }, []);

  useEffect(() => {
    const callback = () => {
      const nextRoute = routeInterceptor(
        parseRoute(new URL(window.location.href)),
      );
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
      <Slot id={getRouteSlotId(route.path)} />
    );
  const rootElement = (
    <Slot id="root">
      <CustomErrorHandler has404={has404}>{routeElement}</CustomErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route,
        changeRoute,
        prefetchRoute,
        routeChangeEvents,
        fetchingSlices: fetchingSlicesRef.current,
      }}
    >
      {rootElement}
    </RouterContext>
  );
};

export function Router({
  initialRoute = parseRouteFromLocation(),
  unstable_fetchRscStore,
  unstable_routeInterceptor,
}: {
  initialRoute?: RouteProps;
  unstable_fetchRscStore?: Parameters<typeof Root>[0]['unstable_fetchRscStore'];
  unstable_routeInterceptor?: (route: RouteProps) => RouteProps | false;
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = createRscParams(initialRoute.query);
  return (
    <Root
      initialRscPath={initialRscPath}
      initialRscParams={initialRscParams}
      unstable_fetchRscStore={unstable_fetchRscStore}
    >
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

// Highly experimental to expose internal APIs
// Subject to change without notice
export type Unstable_RouteProps = RouteProps;
export const unstable_HAS404_ID = HAS404_ID;
export const unstable_IS_STATIC_ID = IS_STATIC_ID;
export const unstable_ROUTE_ID = ROUTE_ID;
export const unstable_SKIP_HEADER = SKIP_HEADER;
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
export type Unstable_SliceId = SliceId;
export type Unstable_InferredPaths = InferredPaths;
export const unstable_parseRoute = parseRoute;
