import { unstable_combineElements as combineElements } from '../../minimal/client.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { getRouteFromElements } from './element-meta.js';
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
    unstable_filter: (key) =>
      key === ROUTE_ID ||
      key === HAS404_ID ||
      key === IS_STATIC_ID ||
      (typeof key === 'string' &&
        ((rscRouteChanged && key === routeSlotId) ||
          (Object.hasOwn(current, key) === Object.hasOwn(base, key) &&
            current[key] === base[key]))),
  });
};
