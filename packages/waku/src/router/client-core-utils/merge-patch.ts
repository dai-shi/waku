import {
  unstable_combineElements as combineElements,
  unstable_isSameElement as isSameElement,
} from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteFromElements,
  getRouteSlotId,
} from '../isomorphic-utils/router-protocol.js';
import type { Loaded } from './load.js';
import { isSameRscRoute } from './route-url.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const buildMergePatch = (
  outcome: Pick<Loaded, 'route' | 'elements'>,
  current: Elements,
  base: Elements,
  opts: { settled: RouteProps },
): Elements => {
  const { elements } = outcome;
  const responseRoute = getRouteFromElements(elements) ?? outcome.route;
  const routeSlotId = getRouteSlotId(responseRoute.path);
  const rscRouteChanged = !isSameRscRoute(responseRoute, opts.settled);
  // A server action can merge newer values while this request waits.
  return combineElements({}, elements, {
    filter: (key) =>
      key === ROUTE_ID ||
      key === HAS404_ID ||
      key === IS_STATIC_ID ||
      (typeof key === 'string' &&
        ((rscRouteChanged && key === routeSlotId) ||
          isSameElement(current, base, key))),
  });
};
