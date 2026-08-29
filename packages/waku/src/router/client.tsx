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
  unstable_fetchRsc as fetchRsc,
  unstable_getErrorInfo as getErrorInfo,
  unstable_removeBase as removeBase,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterCallServerElementsListener_UNSTABLE as useRegisterCallServerElementsListener,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from '../minimal/client.js';
import {
  type PrefetchOptions,
  canReuseStaticRoute,
  createRscParams,
  getPrefetch,
  getPrefetchedElements,
  hasCachedShell,
  learnStaticFromElements,
  prefetchRoute as prefetchCachedRoute,
} from './client-core-utils/caches.js';
import {
  has404FromElements,
  isStaticFromElements,
} from './client-core-utils/element-meta.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideFollow,
  isFollowable,
} from './client-core-utils/error-route.js';
import { RouterHostContext } from './client-core-utils/host.js';
import type { RouterHost } from './client-core-utils/host.js';
import { abortable, load } from './client-core-utils/load.js';
import { buildMergePatch } from './client-core-utils/merge-patch.js';
import {
  SearchCodecsProvider_UNSTABLE,
  useResolveSearchCodec,
} from './client-core-utils/route-hooks.js';
import {
  useHmrRefetch,
  useInitialRoute,
  useInitialRscParams,
} from './client-core-utils/route-state-hooks.js';
import {
  getRouteUrl,
  isSameRoute,
  isSameRscRoute,
  parseRoute,
} from './client-core-utils/route-url.js';
import {
  scrollToHash,
  shouldScrollByDefault,
  shouldScrollForRouteChange,
} from './client-core-utils/scroll.js';
import type { SliceId } from './client-core-utils/slice.js';
import {
  ROUTER_STATE_ID,
  getRouterState,
  getSettledRoute,
  makeRouterState,
  pinForSwr,
  resolveServerRedirect,
} from './client-utils/router-state.js';
import type { RouterState } from './client-utils/router-state.js';
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

const isAltClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 ||
  !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);

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

type PrefetchRoute = (route: RouteProps, options?: PrefetchOptions) => void;

const RouterContext = createContext<{
  route: RouteProps;
  changeRoute: ChangeRoute;
  getElements?: () => Record<string, unknown>;
} | null>(null);

const canPaintInstantOverlay = (
  follows: number,
  route: RouteProps,
  resolvedElements: Record<string, unknown>,
) => !follows && hasCachedShell(route, resolvedElements);

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

const prefetchRouteUnlessReusable = (
  route: RouteProps,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) => {
  const elements = getElements?.();
  // a shared staticPathSet is not enough; skip only when this root has the slot
  if (elements && canReuseStaticRoute(route, elements)) {
    return;
  }
  prefetchCachedRoute(route, options);
};

const prefetchIfNotCurrent = (
  current: RouteProps | undefined,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) => {
  if (!current) {
    return;
  }
  const route = parseRoute(new URL(resolvedTo, window.location.href));
  if (!isSameRscRoute(route, current)) {
    preloadRouteModules(route.path);
    prefetchRouteUnlessReusable(route, options, getElements);
  }
};

const usePrefetchOnView = (
  ref: RefObject<HTMLAnchorElement | null>,
  current: RouteProps | undefined,
  resolvedTo: string,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
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
            prefetchIfNotCurrent(
              current,
              resolvedTo,
              {
                ...(mode ? { mode } : {}),
                ...(ttl !== undefined ? { ttl } : {}),
              },
              getElements,
            );
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [enabled, mode, ttl, current, resolvedTo, ref, getElements]);
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

  usePrefetchOnView(
    ref,
    router?.route,
    resolvedTo,
    unstable_prefetchOnView,
    router?.getElements,
  );
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
        prefetchIfNotCurrent(
          router?.route,
          resolvedTo,
          unstable_prefetchOnEnter,
          router?.getElements,
        );
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
  const { route, changeRoute } = useRouterOrThrow();
  const routerState = getRouterState(use(useElementsPromise()));
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

const InnerRouter = ({
  fallbackRoute,
  routeInterceptor,
}: {
  fallbackRoute: RouteProps;
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined;
}) => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const routeFallback = useInitialRoute(fallbackRoute);

  const has404 = has404FromElements(elements);
  const initialElementsRef = useRef(elements);
  useEffect(() => {
    learnStaticFromElements(initialElementsRef.current);
  }, []);
  const resolvedElementsRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedElementsRef.current = elements;
  }, [elements]);

  const refetch = useRefetch();
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const pendingNavigationRef = useRef<{
    controller: AbortController;
    queuedState?: RouterState;
  } | null>(null);
  const [navigationError, setNavigationError] = useState<{
    error: unknown;
  }>();
  useEffect(() => {
    if (import.meta.hot) {
      // The listener below owns the current route, not Root's initial path.
      registerRscReloadListener(() => {}, { replace: true });
    }
  }, [registerRscReloadListener]);

  const routerState = getRouterState(elements);
  const destination = useMemo(
    () =>
      routerState &&
      resolveServerRedirect(elements, routerState, routeFallback.path),
    [elements, routerState, routeFallback],
  );
  const currentRoute = destination ? destination.route : routeFallback;
  // only the current state is reconciled, so one slot is enough
  const appliedRef = useRef<RouterState>(undefined);
  const destinationHref = destination?.url.href;
  const currentHash = currentRoute.hash;
  useLayoutEffect(() => {
    const queuedState = pendingNavigationRef.current?.queuedState;
    if (queuedState && queuedState === routerState) {
      learnStaticFromElements(elements);
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
  }, [elements, routerState, destinationHref, currentHash]);

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

  const readSettledRoute = useCallback(
    () => getSettledRoute(resolvedElementsRef.current, routeFallback),
    [routeFallback],
  );
  const getElements = useCallback(() => resolvedElementsRef.current, []);
  useHmrRefetch({
    getSettledRoute: readSettledRoute,
    onBeforeRefetch: cancelPendingNavigation,
  });

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
        !canReuseStaticRoute(nextRoute, resolvedElementsRef.current) &&
        !canPaintInstantOverlay(
          options.follows ?? 0,
          nextRoute,
          resolvedElementsRef.current,
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
      // commit before any await so it stays in the caller's startTransition
      if (
        canReuseStaticRoute(nextRoute, resolvedElementsRef.current) ||
        !shouldRefetch
      ) {
        commitRoute(
          nextRoute,
          makeStateForAttempt(initialAttempt, options.history),
          options.instant ? undefined : options.startTransition,
        );
        return;
      }
      const base = resolvedElementsRef.current;
      const initialFollows = options.follows ?? 0;
      const painted =
        !!options.instant &&
        canPaintInstantOverlay(
          initialFollows,
          nextRoute,
          resolvedElementsRef.current,
        );
      const cached = painted ? getPrefetch(nextRoute) : undefined;
      const prefetchedElements = painted
        ? getPrefetchedElements(nextRoute)
        : undefined;
      // overlay/swr is the one store write; load adopts that promise so the
      // follow loop stays in the loader and an adopted landing does not merge
      const adopt = painted
        ? refetch(
            encodeRoutePath(nextRoute.path),
            createRscParams(nextRoute.query),
            {
              signal: controller.signal,
              unstable_overlay: {
                [ROUTER_STATE_ID]: makeStateForAttempt(
                  initialAttempt,
                  options.history,
                ),
                // meta is pinned, so an instant nav has to carry it or it goes stale
                [ROUTE_ID]: [nextRoute.path, nextRoute.query],
                [IS_STATIC_ID]: isStaticFromElements(base),
              },
              unstable_swr: {
                pin: pinForSwr(() => resolvedElementsRef.current),
                ...(prefetchedElements ? { base: prefetchedElements } : {}),
              },
              onBuildIdMismatch: () => reloadWithUrl(routeUrl),
              ...(cached ? { prefetched: cached.promise } : {}),
            },
          )
        : undefined;
      const outcome = await load(nextRoute, {
        signal: controller.signal,
        refetch: shouldRefetch,
        has404,
        settled: settledRoute,
        base,
        url: routeUrl,
        follows: initialFollows,
        onBuildIdMismatch: reloadWithUrl,
        onInvalidate: (url) => {
          if (!controller.signal.aborted) {
            reloadWithUrl(url);
          }
        },
        ...(adopt ? { adopt } : {}),
      });
      if (outcome.type === 'aborted') {
        return;
      }
      // paint already pushed; a follow must replace
      const historyIntent =
        painted && outcome.follows > initialFollows && options.history !== null
          ? 'replace'
          : options.history;
      if (outcome.type === 'reused') {
        commitRoute(
          outcome.route,
          makeStateForAttempt(
            {
              route: outcome.route,
              url: outcome.url,
              follows: outcome.follows,
            },
            historyIntent,
          ),
          options.startTransition || startTransition,
        );
        return;
      }
      if (outcome.type === 'external') {
        commitHistory(outcome.from, historyIntent);
        pendingNavigationRef.current = null;
        window.location.replace(outcome.url.href);
        throw outcome.error;
      }
      if (outcome.type === 'failed') {
        const { error } = outcome;
        const restoreBase = painted;
        const showError = () => {
          if (controller.signal.aborted) {
            return;
          }
          commitHistory(outcome.url, historyIntent);
          const failureState: RouterState = {
            ...makeRouterState(outcome.route, outcome.url, {
              history: null,
              scroll: false,
              pathChanged: false,
              follows: outcome.follows,
            }),
            failedFrom: settledRoute,
          };
          void mergeElements({
            ...(restoreBase
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
      if (outcome.adopted) {
        learnStaticFromElements(outcome.elements);
        pendingNavigationRef.current = null;
        return;
      }
      const landed: NavigationAttempt = {
        route: outcome.route,
        url: outcome.url,
        follows: outcome.follows,
      };
      const destination = resolveServerRedirect(
        outcome.elements,
        makeStateForAttempt(landed, historyIntent),
        landed.route.path,
      );
      const finalState = makeRouterState(destination.route, destination.url, {
        history: historyIntent,
        scroll: options.shouldScroll,
        pathChanged:
          requestedPathChanged || destination.route.path !== settledRoute.path,
        follows: landed.follows,
      });
      commit(
        finalState,
        () => {
          const patch = buildMergePatch(
            { route: landed.route, elements: outcome.elements },
            resolvedElementsRef.current,
            base,
            { settled: settledRoute },
          );
          void mergeElements({
            ...patch,
            [ROUTER_STATE_ID]: finalState,
          });
        },
        options.startTransition || startTransition,
      );
    },
    [
      routeFallback,
      refetch,
      mergeElements,
      cancelPendingNavigation,
      has404,
      registerRscReloadListener,
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
  const registerCallServerElementsListener =
    useRegisterCallServerElementsListener();
  useEffect(() => {
    const listener = (elements: Record<string, unknown>) => {
      learnStaticFromElements(elements);
      const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = elements;
      changeRouteFromServer(routeData, isStatic).catch((err) => {
        if (!isFollowable(err)) {
          console.error('Error while handling route updates:', err);
        }
      });
    };
    return registerCallServerElementsListener(listener);
  }, [changeRouteFromServer, registerCallServerElementsListener]);

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
