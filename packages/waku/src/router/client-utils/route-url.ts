import {
  unstable_addBase as addBase,
  unstable_removeBase as removeBase,
} from '../../minimal/client.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export const pathnameToCurrentRoutePath = (pathname: string) =>
  pathnameToRoutePath(
    removeBase(pathname, import.meta.env.WAKU_CONFIG_BASE_PATH),
  );

export const parseRoute = (url: URL): RouteProps => {
  const { pathname, searchParams, hash } = url;
  return {
    path: pathnameToCurrentRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
};

export const getRouteUrl = (route: RouteProps): URL => {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = addBase(route.path, import.meta.env.WAKU_CONFIG_BASE_PATH);
  nextUrl.search = route.query;
  nextUrl.hash = route.hash;
  return nextUrl;
};

export const isSameRoute = (next: RouteProps, prev: RouteProps) =>
  next.path === prev.path &&
  next.query === prev.query &&
  next.hash === prev.hash;

export const parseRedirectUrl = (location: string, base: string | URL) => {
  const url = new URL(location, base);
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url
    : undefined;
};
