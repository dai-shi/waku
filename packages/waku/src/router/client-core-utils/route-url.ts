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

export const isInsideBase = (url: URL) =>
  url.pathname.startsWith(import.meta.env.WAKU_CONFIG_BASE_PATH);

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

type RscRoute = Pick<RouteProps, 'path' | 'query'>;

export const isSameRscRoute = (next: RscRoute, prev: RscRoute) =>
  next.path === prev.path && next.query === prev.query;

export const parseRedirectUrl = (location: string, base: string | URL) => {
  let url: URL;
  try {
    url = new URL(location, base);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  url.username = '';
  url.password = '';
  // a location the server never resolved can name this host over plaintext,
  // and the browser is the one that knows the scheme it is on
  if (url.protocol === 'http:' && url.host === window.location.host) {
    url.protocol = window.location.protocol;
  }
  return url;
};

export const redactCredentials = (location: string) =>
  location.replace(/\/\/[^/@]*@/, '//');
