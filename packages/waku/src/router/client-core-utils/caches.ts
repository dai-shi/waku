import { unstable_fetchRsc as fetchRsc } from '../../minimal/client.js';
import {
  encodeRoutePath,
  getRouteSlotId,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  canCommitInstantly,
  getRouteFromElements,
  isStaticFromElements,
} from './element-meta.js';
import {
  type PrefetchEntry,
  type PrefetchOptions,
  createPrefetchManager,
} from './prefetch-cache.js';

type Elements = Record<string | symbol, unknown>;

export type { PrefetchOptions } from './prefetch-cache.js';

export type PrefetchHandle = Pick<PrefetchEntry, 'promise' | 'onInvalidate'>;

export const createRscParams = (query: string): URLSearchParams =>
  new URLSearchParams({ query });

export const createCaches = () => {
  const manager = createPrefetchManager();
  const staticPathSet = new Set<string>();

  const getPrefetchedElements = (route: RouteProps): Elements | undefined =>
    manager.getElements(encodeRoutePath(route.path));

  return {
    prefetchRoute: (route: RouteProps, options?: PrefetchOptions): void => {
      // skip is canReuseStaticRoute at the caller, which has this root's elements
      const rscPath = encodeRoutePath(route.path);
      manager.prefetch(
        rscPath,
        route.query,
        (base, invalidate) =>
          fetchRsc(rscPath, createRscParams(route.query), {
            ...(base ? { unstable_base: base } : {}),
            onBuildIdMismatch: () => {
              invalidate();
              manager.clear();
            },
          }),
        options,
      );
    },
    hasCachedShell: (
      route: RouteProps,
      currentElements: Record<string, unknown>,
    ): boolean =>
      canCommitInstantly(
        getRouteSlotId(route.path),
        currentElements,
        getPrefetchedElements(route),
      ),
    getPrefetchedElements,
    getPrefetch: (route: RouteProps): PrefetchHandle | undefined =>
      manager.get(encodeRoutePath(route.path), route.query),
    canReuseStaticRoute: (
      route: RouteProps,
      currentElements: Elements,
    ): boolean =>
      staticPathSet.has(route.path) &&
      getRouteSlotId(route.path) in currentElements,
    learnStaticFromElements: (elements: Record<string, unknown>): void => {
      const route = getRouteFromElements(elements);
      if (route && isStaticFromElements(elements)) {
        staticPathSet.add(route.path);
      }
    },
    clear: (): void => {
      manager.clear();
      staticPathSet.clear();
    },
  };
};

export type Caches = ReturnType<typeof createCaches>;

const singleton = createCaches();

export const prefetchRoute = (
  route: RouteProps,
  options?: PrefetchOptions,
): void => singleton.prefetchRoute(route, options);

export const hasCachedShell = (
  route: RouteProps,
  currentElements: Record<string, unknown>,
): boolean => singleton.hasCachedShell(route, currentElements);

export const getPrefetchedElements = (
  route: RouteProps,
): Elements | undefined => singleton.getPrefetchedElements(route);

export const getPrefetch = (route: RouteProps): PrefetchHandle | undefined =>
  singleton.getPrefetch(route);

export const canReuseStaticRoute = (
  route: RouteProps,
  currentElements: Elements,
): boolean => singleton.canReuseStaticRoute(route, currentElements);

export const learnStaticFromElements = (
  elements: Record<string, unknown>,
): void => singleton.learnStaticFromElements(elements);

export const clearCaches = (): void => {
  singleton.clear();
};

const registeredLazySlices = new Set<string>();

export const registerLazySlice = (id: string): void => {
  registeredLazySlices.add(id);
};

export const forEachRegisteredLazySlice = (fn: (id: string) => void): void => {
  registeredLazySlices.forEach(fn);
};

export const clearRegisteredLazySlices = (): void => {
  registeredLazySlices.clear();
};
