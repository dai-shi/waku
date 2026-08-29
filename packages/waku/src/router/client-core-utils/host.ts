// reload cannot be expressed here (no refetch bit; a same-route navigate would no-op)

import { createContext, useContext } from 'react';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

/**
 * Binding-supplied route snapshot and navigation.
 *
 * Bindings that call `load` must commit `outcome.url` after follows so the
 * address bar matches the landed route, and must follow a redirect thrown
 * while rendering the landed slot. Bound that chain (`decideFollow`,
 * `MAX_FOLLOWS_PER_NAVIGATION`) and surface the failure; `load` cannot,
 * because the throw happens after it returns. Pass `onBuildIdMismatch` and
 * `onInvalidate` for build-mismatch recovery or omit them so `load` leaves
 * minimal's reload default in place. `navigate` must honor `scroll`.
 */
export type RouterHost = {
  route: RouteProps;
  /**
   * Navigate to `href` (`push` or `replace`). `scroll` is up to the binding when
   * omitted.
   *
   * Resolves once the requested navigation has been handled: after its
   * response when the route needs one, right away when it does not, and when a
   * newer navigation supersedes it. Rejects when the navigation fails, when a
   * redirect hands the page to the browser, and when no custom 404 route can
   * answer a missing route.
   */
  navigate: (
    href: string,
    opts: {
      history: 'push' | 'replace';
      scroll?: boolean;
    },
  ) => Promise<void>;
};

export const RouterHostContext = createContext<RouterHost | null>(null);

export const useRouterHost = (): RouterHost => {
  const host = useContext(RouterHostContext);
  if (!host) {
    throw new Error('Missing RouterHost');
  }
  return host;
};
