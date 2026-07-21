import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export const getRouteFromElements = (
  elements: Record<string, unknown>,
): RouteProps | undefined => {
  const routeData = elements[ROUTE_ID] as [string, string] | undefined;
  return routeData
    ? { path: routeData[0], query: routeData[1], hash: '' }
    : undefined;
};

export const isStaticFromElements = (elements: Record<string, unknown>) =>
  !!elements[IS_STATIC_ID];

export const has404FromElements = (elements: Record<string, unknown>) =>
  !!elements[HAS404_ID];

export const isMetaKey = (key: string) =>
  key === ROUTE_ID || key === HAS404_ID || key.startsWith(IS_STATIC_ID);

export const getServerRedirect = (
  elements: Record<string, unknown>,
  route: RouteProps,
): RouteProps | undefined => {
  const serverRoute = getRouteFromElements(elements);
  if (
    serverRoute &&
    (serverRoute.path !== route.path ||
      (!isStaticFromElements(elements) && serverRoute.query !== route.query))
  ) {
    return serverRoute;
  }
  return undefined;
};
