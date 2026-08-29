import { ETAG_ID_PREFIX } from '../../lib/utils/etags.js';
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

type Elements = Record<string | symbol, unknown>;

export const buildMergePatch = (
  outcome: Pick<Loaded, 'route' | 'elements'>,
  current: Elements,
  base: Elements,
  opts: { settled: RouteProps },
): Elements => {
  const { elements } = outcome;
  const update: Elements = {};
  const responseRoute = getRouteFromElements(elements) ?? outcome.route;
  const routeSlotId = getRouteSlotId(responseRoute.path);
  const routeEtagId = ETAG_ID_PREFIX + routeSlotId;
  const rscRouteChanged = !isSameRscRoute(responseRoute, opts.settled);
  // A server action can merge newer values while this request waits.
  for (const [key, value] of Object.entries(elements)) {
    if (
      (rscRouteChanged && (key === routeSlotId || key === routeEtagId)) ||
      (Object.hasOwn(current, key) === Object.hasOwn(base, key) &&
        current[key] === base[key])
    ) {
      update[key] = value;
    }
  }
  Object.assign(update, {
    ...(ROUTE_ID in elements ? { [ROUTE_ID]: elements[ROUTE_ID] } : {}),
    ...(HAS404_ID in elements ? { [HAS404_ID]: elements[HAS404_ID] } : {}),
    ...(IS_STATIC_ID in elements
      ? { [IS_STATIC_ID]: elements[IS_STATIC_ID] }
      : {}),
  });
  return update;
};
