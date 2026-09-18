import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  unstable_combineElements as combineElements,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from '../../minimal/client.js';
import { useRouterCache } from '../client-core-utils/caches.js';
import { has404FromElements } from '../client-core-utils/element-meta.js';
import { isFollowable } from '../client-core-utils/error-route.js';
import { useHmrRefetch } from '../client-core-utils/hmr.js';
import { useInitialRoute } from '../client-core-utils/initial-route.js';
import { load } from '../client-core-utils/load.js';
import { buildMergePatch } from '../client-core-utils/merge-patch.js';
import {
  getRouteUrl,
  isSameRoute,
  isSameRscRoute,
  parseRoute,
} from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../isomorphic-utils/route-path.js';
import {
  canPaintInstantOverlay,
  useStartInstantPaint,
} from './instant-navigation.js';
import { dispatchChangeRoute } from './router-context.js';
import type { ChangeRoute, ChangeRouteOptions } from './router-context.js';
import {
  ROUTER_STATE_ID,
  getRouterState,
  makeRouterState,
  resolveServerRedirect,
  getSettledRoute as resolveSettledRoute,
} from './router-state.js';
import type { RouterState } from './router-state.js';
import { scrollToHash, shouldScrollForRouteChange } from './scroll.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

const ACTION_ENHANCER_ORDER = 100;

type HistoryIntent = ChangeRouteOptions['history'];

type NavigationAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

type NavigationError = { error: unknown };

type Navigation = {
  route: RouteProps;
  changeRoute: ChangeRoute;
  getElements: () => Elements;
  error: NavigationError | undefined;
};

const commitHistory = (url: URL, mode: HistoryIntent): void => {
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

export const useNavigation = (
  elements: Elements,
  fallbackRoute: RouteProps,
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined,
): Navigation => {
  const cache = useRouterCache();
  const routeFallback = useInitialRoute(fallbackRoute);
  const has404 = has404FromElements(elements);
  const initialElementsRef = useRef(elements);
  useEffect(() => {
    cache.learnStaticFromElements(initialElementsRef.current);
  }, [cache]);

  const resolvedElementsRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedElementsRef.current = elements;
  }, [elements]);
  const getElements = useCallback(() => resolvedElementsRef.current, []);

  const startInstantPaint = useStartInstantPaint(getElements, reloadWithUrl);
  const mergeElements = useMergeElements();
  const registerRscEnhancer = useRegisterRscEnhancer();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const [navigationError, setNavigationError] = useState<NavigationError>();
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
  const route = destination ? destination.route : routeFallback;
  const pendingNavigationRef = useRef<{
    controller: AbortController;
    route: Pick<RouteProps, 'path' | 'query'>;
    queuedState?: RouterState;
  } | null>(null);
  const appliedRef = useRef<RouterState>(undefined);
  const destinationHref = destination?.url.href;
  const currentHash = route.hash;
  useLayoutEffect(() => {
    const queuedState = pendingNavigationRef.current?.queuedState;
    if (queuedState && queuedState === routerState) {
      cache.learnStaticFromElements(elements);
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
    scrollToHash(currentHash, pathChanged ? 'instant' : 'auto', pathChanged);
  }, [cache, elements, routerState, destinationHref, currentHash]);

  const cancelPendingNavigation = useCallback(() => {
    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigation?.controller.abort();
    if (pendingNavigation?.queuedState) {
      // Append the committed snapshot after the superseded transition update.
      // The explicit key also clears state absent from the initial snapshot.
      const committed = getElements();
      void mergeElements(committed, {
        unstable_overlay: { [ROUTER_STATE_ID]: getRouterState(committed) },
      });
    }
    pendingNavigationRef.current = null;
  }, [getElements, mergeElements]);

  const getSettledRoute = useCallback(
    () => resolveSettledRoute(getElements(), routeFallback),
    [getElements, routeFallback],
  );
  useHmrRefetch({
    getSettledRoute,
    onBeforeRefetch: cancelPendingNavigation,
  });

  const changeRoute: ChangeRoute = useCallback(
    async function changeRoute(nextRoute, options) {
      const settledRoute = resolveSettledRoute(getElements(), routeFallback);
      const shouldRefetch =
        options.refetch ?? !isSameRscRoute(nextRoute, settledRoute);
      // a navigation that commits synchronously must not be wrapped: a transition
      // would deprioritise the paint that unstable_instant exists to deliver
      if (
        options.pendingTransition &&
        shouldRefetch &&
        !cache.canReuseStaticRoute(nextRoute, getElements()) &&
        !canPaintInstantOverlay(
          cache,
          options.follows ?? 0,
          nextRoute,
          getElements(),
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
      pendingNavigationRef.current = { controller, route: nextRoute };
      const commit = (
        state: RouterState,
        update: () => void,
        transition: ((fn: () => void) => void) | undefined,
      ) => {
        const callback = () => {
          if (controller.signal.aborted) {
            return;
          }
          pendingNavigationRef.current = {
            controller,
            route: { path: state.requested[0], query: state.requested[1] },
            queuedState: state,
          };
          update();
        };
        if (transition) {
          transition(callback);
        } else {
          callback();
        }
      };
      const commitRoute = (
        next: RouteProps,
        state: RouterState,
        transition: ((fn: () => void) => void) | undefined,
      ) => {
        commit(
          state,
          () => {
            void mergeElements({
              [ROUTE_ID]: [next.path, next.query],
              [ROUTER_STATE_ID]: state,
            });
          },
          transition,
        );
      };
      // commit before any await so it stays in the caller's startTransition
      if (
        cache.canReuseStaticRoute(nextRoute, getElements()) ||
        !shouldRefetch
      ) {
        commitRoute(
          nextRoute,
          makeStateForAttempt(initialAttempt, options.history),
          undefined,
        );
        return;
      }
      const base = getElements();
      const initialFollows = options.follows ?? 0;
      const instantResponse = options.instant
        ? startInstantPaint(
            initialAttempt,
            makeStateForAttempt(initialAttempt, options.history),
            controller.signal,
          )
        : undefined;
      const outcome = await load(cache, nextRoute, {
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
        ...(instantResponse ? { adopt: instantResponse } : {}),
      });
      if (outcome.type === 'aborted') {
        return;
      }
      // paint already pushed; a follow must replace
      const historyIntent =
        instantResponse &&
        outcome.follows > initialFollows &&
        options.history !== null
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
          startTransition,
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
        const restoreBase = !!instantResponse;
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
        showError();
        throw error;
      }
      if (outcome.adopted) {
        cache.learnStaticFromElements(outcome.elements);
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
            getElements(),
            base,
            { settled: settledRoute },
          );
          void mergeElements(patch, {
            unstable_overlay: { [ROUTER_STATE_ID]: finalState },
          });
        },
        startTransition,
      );
    },
    [
      cache,
      routeFallback,
      startInstantPaint,
      mergeElements,
      getElements,
      cancelPendingNavigation,
      has404,
      registerRscReloadListener,
    ],
  );

  // an action a descendant starts in a passive effect must find this enhancer
  useLayoutEffect(() => {
    const handleActionElements = (nextElements: Record<string, unknown>) => {
      cache.learnStaticFromElements(nextElements);
      const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } = nextElements;
      if (!routeData) {
        return;
      }
      const [path, query] = routeData as [string, string];
      const settledRoute = getSettledRoute();
      if (
        settledRoute.path === path &&
        (isStatic || settledRoute.query === query)
      ) {
        return;
      }
      const nextRoute = { path, query, hash: '' };
      const is404 = path === '/404';
      dispatchChangeRoute(changeRoute, nextRoute, {
        refetch: false,
        shouldScroll: false,
        // the 404 route renders where the user already is
        history: is404 ? null : 'push',
        url: is404 ? new URL(window.location.href) : getRouteUrl(nextRoute),
      }).catch((error) => {
        if (!isFollowable(error)) {
          console.error('Error while handling route updates:', error);
        }
      });
    };
    return registerRscEnhancer(
      (next) => async (rscPath, rscParams, options) => {
        if (options.type !== 'call') {
          return next(rscPath, rscParams, options);
        }
        const origin = getSettledRoute();
        const result = await next(rscPath, rscParams, {
          ...options,
          fetch: (input, init) => {
            const headers = new Headers(
              init?.headers ??
                (input instanceof Request ? input.headers : undefined),
            );
            headers.set(
              ACTION_LOCATION_HEADER,
              origin.query ? origin.path + '?' + origin.query : origin.path,
            );
            return options.fetch(input, { ...init, headers });
          },
        });
        if (!(IS_ORIGIN_ID in result.elements)) {
          if (Reflect.ownKeys(result.elements).length) {
            // TODO: this commits the route while the chain is still unwinding,
            // so an enhancer above this order that delays the result paints the
            // route before its slot is merged. Return the route keys in
            // result.elements instead, so Minimal applies both in one merge.
            handleActionElements(result.elements);
          }
          return result;
        }
        const pending = pendingNavigationRef.current;
        // React holds a navigation back until a pending action settles
        if (
          (pending && !isSameRscRoute(pending.route, origin)) ||
          !isSameRscRoute(getSettledRoute(), origin)
        ) {
          return { ...result, elements: {} };
        }
        const elements = combineElements({}, result.elements, {
          unstable_filter: (key) => key !== IS_ORIGIN_ID,
        });
        handleActionElements(elements);
        return { ...result, elements };
      },
      ACTION_ENHANCER_ORDER,
    );
  }, [cache, changeRoute, getSettledRoute, registerRscEnhancer]);

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
            getSettledRoute(),
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
  }, [changeRoute, routeInterceptor, getSettledRoute]);

  return {
    route,
    changeRoute,
    getElements,
    error: navigationError,
  };
};
