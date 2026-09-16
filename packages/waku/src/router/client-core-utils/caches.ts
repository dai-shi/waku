import { useFetchRsc_UNSTABLE as useFetchRsc } from '../../minimal/client.js';
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
import { createSliceCache } from './slice-cache.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export type FetchRsc = ReturnType<typeof useFetchRsc>;

export type { PrefetchOptions } from './prefetch-cache.js';

export type PrefetchHandle = Pick<PrefetchEntry, 'promise' | 'onInvalidate'>;

export const createRscParams = (query: string): URLSearchParams =>
  new URLSearchParams({ query });

const createRouterCache = (fetchRsc: FetchRsc) => {
  const manager = createPrefetchManager();
  const staticPathSet = new Set<string>();

  const getPrefetchedElements = (route: RouteProps): Elements | undefined =>
    manager.getElements(encodeRoutePath(route.path));

  return {
    fetchRsc,
    slices: createSliceCache(fetchRsc),
    prefetchRoute: (route: RouteProps, options?: PrefetchOptions): void => {
      // the caller skips this with canReuseStaticRoute, which needs its elements
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
    clearCaches: (): void => {
      manager.clear();
      staticPathSet.clear();
    },
  };
};

export type RouterCache = ReturnType<typeof createRouterCache>;

const routerCaches = new WeakMap<FetchRsc, RouterCache>();

export const getRouterCache = (fetchRsc: FetchRsc): RouterCache => {
  let cache = routerCaches.get(fetchRsc);
  if (!cache) {
    cache = createRouterCache(fetchRsc);
    routerCaches.set(fetchRsc, cache);
  }
  return cache;
};

/**
 * Returns the Router cache of the enclosing Root. Outside a Root every caller
 * shares one cache, as they share one fetch.
 */
export const useRouterCache = (): RouterCache => getRouterCache(useFetchRsc());
