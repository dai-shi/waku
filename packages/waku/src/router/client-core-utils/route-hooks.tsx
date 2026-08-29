import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type {
  RouteParams,
  RouteSearch,
} from '../create-pages-utils/inferred-path-types.js';
import type { RoutePath } from '../isomorphic-utils/build-route-href.js';
import { matchRouteParams } from '../isomorphic-utils/match-route-params.js';
import {
  type AnyCodec,
  getRouteSearchCodecId,
  isCodec,
} from '../isomorphic-utils/search-codec-registry.js';
import { useRouterHost } from './host.js';
import { getRouteUrl } from './route-url.js';

const SearchCodecsContext = createContext<ReadonlyMap<string, AnyCodec>>(
  new Map(),
);

export const useResolveSearchCodec = () => {
  const codecs = useContext(SearchCodecsContext);
  return useCallback(
    (routePath: string): AnyCodec | undefined => {
      const id = getRouteSearchCodecId(routePath);
      return id !== undefined ? codecs.get(id) : undefined;
    },
    [codecs],
  );
};

/**
 * Read the current route's params, typed from the `from` path, or null when
 * the current path does not match it. Re-renders when the route path changes.
 * The result is memoized by path, so its identity changes on navigation to a
 * different path; read its fields rather than using the object itself as an
 * effect dependency.
 */
export function useParams_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteParams<Path> | null {
  const { route } = useRouterHost();
  return useMemo(() => matchRouteParams(from, route.path), [from, route.path]);
}

/**
 * Provide search codecs to `useSearch_UNSTABLE`, `useSetSearch_UNSTABLE`,
 * `push`, and `Link`. Render it in your root layout so the codecs are present in
 * both the SSR render and the browser. Pass only search codecs: a codec-only
 * module (via `import * as`), a record, or an array. A value that is not a codec
 * is ignored with a warning, so keep helpers and constants out of the module you
 * pass (or list the codecs explicitly).
 */
export function SearchCodecsProvider_UNSTABLE({
  searchCodecs,
  children,
}: {
  searchCodecs: Record<string, unknown> | readonly unknown[];
  children: ReactNode;
}): ReactElement {
  const codecs = useMemo(() => {
    const map = new Map<string, AnyCodec>();
    const values = Array.isArray(searchCodecs)
      ? searchCodecs
      : Object.values(searchCodecs);
    for (const value of values) {
      if (!isCodec(value)) {
        console.warn(
          'SearchCodecsProvider_UNSTABLE ignored a value that is not a search codec; pass only codecs (a codec-only module or an explicit array).',
          value,
        );
        continue;
      }
      const existing = map.get(value.id);
      if (existing && existing !== value) {
        throw new Error(`Duplicate search codec id: "${value.id}"`);
      }
      map.set(value.id, value);
    }
    return map;
  }, [searchCodecs]);
  return <SearchCodecsContext value={codecs}>{children}</SearchCodecsContext>;
}

/**
 * Read the current route's typed `search`, parsed client-side with the route's
 * codec (provided via `SearchCodecsProvider_UNSTABLE`), or null when the current
 * path does not match `from` or the route has no codec. Re-renders when the
 * query changes.
 */
export function useSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): RouteSearch<Path> | null {
  const { route } = useRouterHost();
  const codecs = useContext(SearchCodecsContext);
  return useMemo(() => {
    if (matchRouteParams(from, route.path) === null) {
      return null;
    }
    const codecId = getRouteSearchCodecId(from);
    const codec = codecId !== undefined ? codecs.get(codecId) : undefined;
    return codec ? (codec.parse(route.query) as RouteSearch<Path>) : null;
  }, [from, route.path, route.query, codecs]);
}

type SetSearch<Path extends RoutePath> = (
  update:
    | Partial<RouteSearch<Path>>
    | ((prev: RouteSearch<Path>) => Partial<RouteSearch<Path>>),
  options?: { history?: 'push' | 'replace'; scroll?: boolean },
) => Promise<void>;

/**
 * Returns a setter for the current route's `search`, serialized client-side with
 * the route's codec (provided via `SearchCodecsProvider_UNSTABLE`). Accepts a
 * partial or an updater of the current search and navigates (push by default, or
 * replace) to the same path. A no-op when the current path does not match `from`
 * or has no codec.
 */
export function useSetSearch_UNSTABLE<Path extends RoutePath>({
  from,
}: {
  from: Path;
}): SetSearch<Path> {
  const { route, navigate } = useRouterHost();
  const codecs = useContext(SearchCodecsContext);
  return useCallback<SetSearch<Path>>(
    async (update, options) => {
      if (matchRouteParams(from, route.path) === null) {
        return;
      }
      const codecId = getRouteSearchCodecId(from);
      const codec = codecId !== undefined ? codecs.get(codecId) : undefined;
      if (!codec) {
        return;
      }
      const prev = codec.parse(route.query) as RouteSearch<Path>;
      const partial = typeof update === 'function' ? update(prev) : update;
      const nextQuery = codec.serialize({ ...prev, ...partial });
      const nextUrl = getRouteUrl({
        path: route.path,
        query: nextQuery,
        hash: route.hash,
      });
      await navigate(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`, {
        history: options?.history ?? 'push',
        scroll: options?.scroll ?? false,
      });
    },
    [from, route.path, route.query, route.hash, codecs, navigate],
  );
}
