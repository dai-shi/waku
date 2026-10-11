import { useCallback, useMemo } from 'react';
import type {
  NormalizePath,
  RoutePath,
} from '../isomorphic-utils/build-route-href.js';
import { matchRouteParams } from '../isomorphic-utils/match-route-params.js';
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec.js';
import { useRouterHost } from './host.js';
import { getRouteUrl } from './route-url.js';

type SetSearch<Search> = (
  update: Partial<Search> | ((prev: Search) => Partial<Search>),
  options?: { history?: 'push' | 'replace'; scroll?: boolean },
) => Promise<void>;

type SearchRoute<
  Path extends string,
  Search extends Record<string, unknown>,
> = {
  path: NormalizePath<Path> extends NormalizePath<RoutePath> ? Path : never;
  searchCodec: Unstable_SearchCodec<Search>;
};

/**
 * Parse the current RouterHost query with a local route's codec. Returns null
 * for a different path; codec errors propagate to the render boundary. The
 * result is memoized by path, codec and query. Generated route types reject
 * unknown patterns; route groups are ignored.
 */
export function useSearch_UNSTABLE<
  const Path extends string,
  Search extends Record<string, unknown>,
>({ path, searchCodec }: SearchRoute<Path, Search>): Search | null {
  const { route } = useRouterHost();
  return useMemo(
    () =>
      matchRouteParams(path as RoutePath, route.path) === null
        ? null
        : searchCodec.parse(route.query),
    [path, searchCodec, route.path, route.query],
  );
}

/**
 * Shallow-merge a partial search (or updater result) with the current parsed
 * query, serialize it, and navigate through RouterHost.
 * Keeps the current pathname, base, and hash; defaults to push and no scroll.
 * A mismatched path is a no-op. Codec and navigation errors reject the promise.
 * Outbound validation belongs in `serialize`; only the current query is parsed.
 */
export function useSetSearch_UNSTABLE<
  const Path extends string,
  Search extends Record<string, unknown>,
>({ path, searchCodec }: SearchRoute<Path, Search>): SetSearch<Search> {
  const { route, navigate } = useRouterHost();
  return useCallback<SetSearch<Search>>(
    async (update, options) => {
      if (matchRouteParams(path as RoutePath, route.path) === null) {
        return;
      }
      const prev = searchCodec.parse(route.query);
      const partial = typeof update === 'function' ? update(prev) : update;
      const nextUrl = getRouteUrl({
        path: route.path,
        query: searchCodec.serialize({ ...prev, ...partial }),
        hash: route.hash,
      });
      await navigate(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`, {
        history: options?.history ?? 'push',
        scroll: options?.scroll ?? false,
      });
    },
    [path, searchCodec, route.path, route.query, route.hash, navigate],
  );
}
