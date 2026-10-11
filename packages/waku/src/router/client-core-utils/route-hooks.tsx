import { useMemo } from 'react';
import type { RouteParams } from '../create-pages-utils/inferred-path-types.js';
import type { RoutePath } from '../isomorphic-utils/build-route-href.js';
import { matchRouteParams } from '../isomorphic-utils/match-route-params.js';
import { useRouterHost } from './host.js';

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
