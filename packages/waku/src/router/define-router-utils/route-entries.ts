import {
  unstable_buildElements as buildElements,
  unstable_getErrorInfo as getErrorInfo,
} from 'waku/minimal/server';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from 'waku/minimal/server';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
  getRouteSlotId,
} from '../isomorphic-utils/route-path.js';
import { cacheElementSource, getSlotCacheId } from './element-cache.js';
import type { ElementCache } from './element-cache.js';
import { setRscParams, setRscPath } from './request-store.js';

export type Route = {
  elements: Record<string, ElementSource> & {
    root: ElementSource;
    route: ElementSource;
  };
  noSsr?: boolean;
};

export type Resolve = (
  pathname: string,
  query: string,
) => Promise<Route | ((req: Request) => Promise<Response>) | null>;

export type ResolveElement = (id: string) => Promise<ElementSource | null>;

export const getQuery = (params: unknown): string =>
  params instanceof URLSearchParams
    ? params.get('query') || ''
    : typeof (params as { query?: unknown } | undefined)?.query === 'string'
      ? (params as { query: string }).query
      : '';

export const createRouteEntries = (
  resolve: Resolve,
  resolveElement: ResolveElement | undefined,
  getHas404?: () => Promise<boolean>,
) => {
  let cachedHas404: Promise<boolean> | undefined;
  const has404 =
    getHas404 ??
    (() =>
      (cachedHas404 ??= resolve('/404', '')
        .catch((error) => {
          if (getErrorInfo(error)?.status === 404) {
            return null;
          }
          cachedHas404 = undefined;
          throw error;
        })
        .then((result) => result !== null && typeof result !== 'function')));

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    clientEtags: Etags,
    cache: ElementCache,
    resolvedRoute?: Route,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const pathname = decodeRoutePath(rscPath);
    const query = getQuery(rscParams);
    const resolved = resolvedRoute ?? (await resolve(pathname, query));
    if (!resolved || typeof resolved === 'function') {
      return null;
    }
    for (const id of Object.keys(resolved.elements)) {
      if (
        id !== 'root' &&
        id !== 'route' &&
        (id.startsWith('_') || id.startsWith('route:') || /^[A-Z]/.test(id))
      ) {
        throw new Error('Reserved router element ID: ' + id);
      }
    }
    const { route, ...sources } = resolved.elements;
    const routeId = getRouteSlotId(pathname);
    sources[routeId] = route.immutable
      ? {
          ...route,
          render: () => cache.get(getSlotCacheId(routeId)) ?? route.render(),
        }
      : route;
    const entries = await buildElements(
      clientEtags,
      Object.fromEntries(
        Object.entries(sources).map(([id, source]) => [
          id,
          id === routeId
            ? source
            : cacheElementSource(source, getSlotCacheId(id), cache),
        ]),
      ),
    );
    entries.elements[ROUTE_ID] = [pathname, query];
    entries.elements[IS_STATIC_ID] = Object.values(sources).every(
      (source) => source.immutable,
    );
    if (await has404()) {
      entries.elements[HAS404_ID] = true;
    }
    return entries;
  };

  const getEntriesForElement = async (id: string, cache: ElementCache) => {
    const source = await resolveElement?.(id);
    return source
      ? buildElements(
          {},
          { [id]: cacheElementSource(source, getSlotCacheId(id), cache) },
        )
      : null;
  };

  return { getEntriesForRoute, getEntriesForElement, has404 };
};
