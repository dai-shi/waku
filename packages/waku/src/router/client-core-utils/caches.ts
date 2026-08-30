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

const manager = createPrefetchManager();
const staticPathSet = new Set<string>();

export const prefetchRoute = (
  route: RouteProps,
  options?: PrefetchOptions,
): void => {
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
};

export const hasCachedShell = (
  route: RouteProps,
  currentElements: Record<string, unknown>,
): boolean =>
  canCommitInstantly(
    getRouteSlotId(route.path),
    currentElements,
    getPrefetchedElements(route),
  );

export const getPrefetchedElements = (
  route: RouteProps,
): Elements | undefined => manager.getElements(encodeRoutePath(route.path));

export const getPrefetch = (route: RouteProps): PrefetchHandle | undefined =>
  manager.get(encodeRoutePath(route.path), route.query);

export const canReuseStaticRoute = (
  route: RouteProps,
  currentElements: Elements,
): boolean =>
  staticPathSet.has(route.path) &&
  getRouteSlotId(route.path) in currentElements;

export const learnStaticFromElements = (
  elements: Record<string, unknown>,
): void => {
  const route = getRouteFromElements(elements);
  if (route && isStaticFromElements(elements)) {
    staticPathSet.add(route.path);
  }
};

export const clearCaches = (): void => {
  manager.clear();
  staticPathSet.clear();
};
