import { createContext, startTransition } from 'react';
import type { TransitionFunction } from 'react';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export type ChangeRouteOptions = {
  shouldScroll: boolean;
  refetch?: boolean; // true: force refetch, false: don't refetch, undefined: auto-decide based on route change
  history: 'push' | 'replace' | null;
  url?: URL | undefined;
  instant?: boolean | undefined;
  follows?: number | undefined;
  startTransition?: ((fn: TransitionFunction) => void) | undefined;
  pendingTransition?: ((fn: TransitionFunction) => void) | undefined;
};

export type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

export const RouterContext = createContext<{
  route: RouteProps;
  changeRoute: ChangeRoute;
  getElements?: () => Record<string, unknown>;
} | null>(null);

export const dispatchChangeRoute = (
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
