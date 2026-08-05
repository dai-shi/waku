import { unstable_getErrorInfo as getErrorInfo } from '../../minimal/client.js';
import {
  type RouteProps,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import { getRouteUrl, parseRedirectUrl, parseRoute } from './route-url.js';

export type ErrorRoute =
  | { type: 'route'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'unfollowable'; location: string }
  | { type: 'none' };

export const isFollowable = (error: unknown) => {
  const info = getErrorInfo(error);
  return info?.status === 404 || !!info?.location;
};

export const resolveErrorRoute = (
  error: unknown,
  requestedUrl: URL,
  has404: boolean,
): ErrorRoute => {
  const info = getErrorInfo(error);
  if (info?.location) {
    const parsed = parseRedirectUrl(info.location, requestedUrl);
    if (!parsed) {
      return { type: 'unfollowable', location: info.location };
    }
    if (info.unstable_redirected || parsed.origin !== window.location.origin) {
      return { type: 'leave', url: parsed };
    }
    if (info.location.startsWith('/') && !info.location.startsWith('//')) {
      const target = {
        path: pathnameToRoutePath(parsed.pathname),
        query: parsed.searchParams.toString(),
        hash: parsed.hash,
      };
      return { type: 'route', target, url: getRouteUrl(target) };
    }
    return { type: 'route', target: parseRoute(parsed), url: parsed };
  }
  if (info?.status === 404 && has404) {
    const target = {
      path: '/404',
      query: requestedUrl.searchParams.toString(),
      hash: '',
    };
    return { type: 'route', target, url: requestedUrl };
  }
  return { type: 'none' };
};
