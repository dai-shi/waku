import { useLayoutEffect } from 'react';
import {
  unstable_combineElements as combineElements,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../isomorphic-utils/route-path.js';
import { useRouterCache } from './caches.js';
import { isSameRscRoute } from './route-url.js';

const ACTION_ENHANCER_ORDER = 100;

/**
 * Handles the server actions of the enclosing Root for a binding, so an action
 * can call `unstable_rerenderRoute()` with no arguments to rerender the route
 * it was called from. It registers an RSC enhancer at order 100, and again
 * whenever a callback changes, so pass stable callbacks.
 *
 * Each action reports `getSettledRoute()` as the route it came from. A rerender
 * of that route is dropped, keeping the action's return value, when the
 * settled route has changed by the time the response arrives or
 * `getPendingRoute()` returns another route. `getPendingRoute` returns the
 * destination of a navigation that has not settled yet, or `undefined`.
 *
 * `onRouteChange` receives the route of a response that renders a route other
 * than the settled one. Minimal merges the response's elements after the
 * enhancer chain resolves, so commit that route without fetching it.
 */
export const useActionRouting = ({
  getSettledRoute,
  getPendingRoute,
  onRouteChange,
}: {
  getSettledRoute: () => RouteProps;
  getPendingRoute: () => Pick<RouteProps, 'path' | 'query'> | undefined;
  onRouteChange: (route: RouteProps) => void;
}): void => {
  const cache = useRouterCache();
  const registerRscEnhancer = useRegisterRscEnhancer();
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
      onRouteChange({ path, query, hash: '' });
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
            handleActionElements(result.elements);
          }
          return result;
        }
        const pendingRoute = getPendingRoute();
        // React holds a navigation back until a pending action settles
        if (
          (pendingRoute && !isSameRscRoute(pendingRoute, origin)) ||
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
  }, [
    cache,
    getSettledRoute,
    getPendingRoute,
    onRouteChange,
    registerRscEnhancer,
  ]);
};
