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
  unstable_isSameElement as isSameElement,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from 'waku/minimal/client';
import { useActionRouting } from '../client-core-utils/action-routing.js';
import { useRouterCache } from '../client-core-utils/caches.js';
import { isFollowable } from '../client-core-utils/error-route.js';
import { useHmrRefetch } from '../client-core-utils/hmr.js';
import { useInitialRoute } from '../client-core-utils/initial-route.js';
import { buildMergePatch } from '../client-core-utils/merge-patch.js';
import {
  getRouteUrl,
  isSameRoute,
  isSameRscRoute,
  parseRoute,
} from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  has404FromElements,
} from '../isomorphic-utils/router-protocol.js';
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

type HistoryIntent = ChangeRouteOptions['history'];

type NavigationAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

type NavigationError = { error: unknown };

type NavigationRequest = {
  controller: AbortController | undefined;
  onSuperseded: (() => void) | undefined;
  base: Elements;
  target: Pick<RouteProps, 'path' | 'query'>;
  queuedState?: RouterState;
  getPatches?: (current: Elements) => Elements[];
  committed?: boolean;
};

type Navigation = {
  route: RouteProps;
  changeRoute: ChangeRoute;
  getElements: () => Elements;
  error: NavigationError | undefined;
};

const restoreOwnedElements = (
  base: Elements,
  current: Elements,
  patches: Elements[],
) =>
  combineElements(base, current, {
    filter: (key) =>
      !patches.some((patch) => isSameElement(current, patch, key)),
  });

const commitHistory = (url: URL, mode: HistoryIntent): void => {
  if (window.location.href === url.href) {
    return;
  }
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url);
    return;
  }
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
  const requestRef = useRef<NavigationRequest>(undefined);
  const appliedRef = useRef<{ intent: RouterState['requested']; href: string }>(
    undefined,
  );
  const destinationHref = destination?.url.href;
  const currentHash = route.hash;
  useLayoutEffect(() => {
    if (routerState && requestRef.current?.queuedState === routerState) {
      cache.learnStaticFromElements(elements);
      requestRef.current.committed = true;
      requestRef.current = undefined;
    }
    if (!routerState || !destinationHref) {
      return;
    }
    const applied = appliedRef.current?.intent === routerState.requested;
    if (!applied || appliedRef.current?.href !== destinationHref) {
      commitHistory(
        new URL(destinationHref),
        applied ? 'replace' : routerState.history,
      );
    }
    appliedRef.current = {
      intent: routerState.requested,
      href: destinationHref,
    };
    if (applied || !routerState.scroll) {
      return;
    }
    const { pathChanged } = routerState.scroll;
    scrollToHash(currentHash, pathChanged ? 'instant' : 'auto', pathChanged);
  }, [cache, elements, routerState, destinationHref, currentHash]);

  const replaceRequest = useCallback(
    (next?: NavigationRequest) => {
      const superseded = requestRef.current;
      requestRef.current = next;
      if (superseded?.getPatches) {
        const committed = getElements();
        void mergeElements({}, (prev) =>
          prev.then((current) => {
            const patches = superseded.getPatches?.(committed) ?? [];
            return combineElements(
              restoreOwnedElements(committed, current, patches),
              { [ROUTER_STATE_ID]: getRouterState(committed) },
            );
          }),
        );
      }
      superseded?.controller?.abort();
      if (next) {
        superseded?.onSuperseded?.();
      }
    },
    [getElements, mergeElements],
  );

  const getSettledRoute = useCallback(
    () => resolveSettledRoute(getElements(), routeFallback),
    [getElements, routeFallback],
  );
  useHmrRefetch({
    getSettledRoute,
    onBeforeRefetch: replaceRequest,
  });

  const changeRoute: ChangeRoute = useCallback(
    async function changeRoute(nextRoute, options) {
      const settledRoute = resolveSettledRoute(getElements(), routeFallback);
      const shouldRefetch =
        options.refetch ?? !isSameRscRoute(nextRoute, settledRoute);
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
      const base = getElements();
      const controller = new AbortController();
      const request: NavigationRequest = {
        controller,
        onSuperseded: options.onSuperseded,
        base,
        target: nextRoute,
      };
      const canCommit = () =>
        !!request.committed || requestRef.current === request;
      const superseded = requestRef.current;
      replaceRequest(request);
      if (requestRef.current !== request) {
        return;
      }
      setNavigationError(undefined);
      const finishRequest = () => {
        if (requestRef.current === request) {
          requestRef.current = undefined;
        }
      };
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
      const queueCommit = (
        state: RouterState,
        getPatch: (current: Elements) => Elements,
      ) => {
        if (!canCommit()) {
          return;
        }
        request.queuedState = state;
        const getPreviousPatches = request.getPatches;
        request.getPatches = (current) => [
          ...(getPreviousPatches?.(current) ?? []),
          getPatch(current),
        ];
        void mergeElements({}, (prev) =>
          prev.then((current) =>
            !canCommit()
              ? current
              : combineElements(
                  current,
                  combineElements(getPatch(current), {
                    [ROUTER_STATE_ID]: state,
                  }),
                ),
          ),
        );
      };
      if (
        cache.canReuseStaticRoute(nextRoute, getElements()) ||
        !shouldRefetch
      ) {
        queueCommit(
          makeStateForAttempt(initialAttempt, options.history),
          (current) => {
            const patches =
              superseded && isSameRscRoute(superseded.target, nextRoute)
                ? (superseded.getPatches?.(current) ?? [])
                : [];
            const patch = patches.reduce(
              (combined, patch) => combineElements(combined, patch),
              {},
            );
            return combineElements(
              combineElements({}, patch, {
                filter: (key) =>
                  typeof key === 'string' &&
                  (!Object.hasOwn(current, key) ||
                    (!!superseded &&
                      isSameElement(current, superseded.base, key))),
              }),
              { [ROUTE_ID]: [nextRoute.path, nextRoute.query] },
            );
          },
        );
        return;
      }
      const initialFollows = options.follows ?? 0;
      const instantState = makeStateForAttempt(initialAttempt, options.history);
      const instant = options.instant
        ? startInstantPaint(
            initialAttempt,
            instantState,
            controller.signal,
            canCommit,
          )
        : undefined;
      const instantResponse = instant?.response;
      if (instant) {
        request.getPatches = () => [instant.getPatch()];
      }
      const outcome = await cache.load(nextRoute, {
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
      if (outcome.type === 'aborted' || requestRef.current !== request) {
        return;
      }
      request.controller = undefined;
      const historyIntent =
        instantResponse &&
        outcome.follows > initialFollows &&
        options.history !== null
          ? 'replace'
          : options.history;
      if (outcome.type === 'reused') {
        request.target = outcome.route;
        startTransition(() => {
          queueCommit(makeStateForAttempt(outcome, historyIntent), () => ({
            [ROUTE_ID]: [outcome.route.path, outcome.route.query],
          }));
        });
        return;
      }
      if (outcome.type === 'external') {
        commitHistory(outcome.from, historyIntent);
        finishRequest();
        window.location.replace(outcome.url.href);
        throw outcome.error;
      }
      if (outcome.type === 'failed') {
        const { error } = outcome;
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
          ...(instantResponse
            ? {
                [ROUTE_ID]: base[ROUTE_ID],
                [IS_STATIC_ID]: base[IS_STATIC_ID],
              }
            : {}),
          [ROUTER_STATE_ID]: failureState,
        });
        finishRequest();
        setNavigationError({ error });
        throw error;
      }
      const destination = resolveServerRedirect(
        outcome.elements,
        makeStateForAttempt(outcome, historyIntent),
        outcome.route.path,
      );
      request.target = destination.route;
      if (instantResponse && outcome.follows === initialFollows) {
        cache.learnStaticFromElements(outcome.elements);
        startTransition(() => queueCommit({ ...instantState }, () => ({})));
        return;
      }
      const finalState = makeStateForAttempt(
        { ...destination, follows: outcome.follows },
        historyIntent,
      );
      startTransition(() => {
        queueCommit(finalState, (current) =>
          buildMergePatch(
            outcome,
            instant
              ? restoreOwnedElements(base, current, [instant.getPatch()])
              : current,
            base,
            { settled: settledRoute },
          ),
        );
      });
    },
    [
      cache,
      routeFallback,
      startInstantPaint,
      mergeElements,
      getElements,
      replaceRequest,
      has404,
      registerRscReloadListener,
    ],
  );

  const getPendingRoute = useCallback(() => requestRef.current?.target, []);
  const commitActionRoute = useCallback(
    (nextRoute: RouteProps) => {
      const is404 = nextRoute.path === '/404';
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
    },
    [changeRoute],
  );
  useActionRouting({
    getSettledRoute,
    getPendingRoute,
    onRouteChange: commitActionRoute,
  });

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
