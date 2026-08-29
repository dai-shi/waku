import { unstable_getErrorInfo as getErrorInfo } from '../../minimal/client.js';
import {
  type RouteProps,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import {
  getRouteUrl,
  isInsideBase,
  isSameRscRoute,
  parseRedirectUrl,
  parseRoute,
  redactCredentials,
} from './route-url.js';

export type ErrorRoute =
  | { type: 'route'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'unfollowable'; location: string }
  | { type: 'none' };

/**
 * Whether a caught render error is a redirect or 404 the binding should
 * consider following.
 */
export const isFollowable = (error: unknown) => {
  const info = getErrorInfo(error);
  return info?.status === 404 || !!info?.location;
};

/**
 * Bound on one navigation's follow chain, including slot-thrown redirects
 * after `load` returns.
 */
export const MAX_FOLLOWS_PER_NAVIGATION = 20;

export const resolveErrorRoute = (
  error: unknown,
  requestedUrl: URL,
  has404: boolean,
): ErrorRoute => {
  const info = getErrorInfo(error);
  const location = info?.location;
  if (location) {
    const parsed = parseRedirectUrl(location, requestedUrl);
    if (!parsed) {
      return { type: 'unfollowable', location: redactCredentials(location) };
    }
    if (info.unstable_leave || parsed.origin !== window.location.origin) {
      return { type: 'leave', url: parsed };
    }
    if (location.startsWith('/') && !location.startsWith('//')) {
      const target = {
        path: pathnameToRoutePath(parsed.pathname),
        query: parsed.searchParams.toString(),
        hash: parsed.hash,
      };
      return { type: 'route', target, url: getRouteUrl(target) };
    }
    if (!isInsideBase(parsed)) {
      return { type: 'leave', url: parsed };
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

export type FollowDecision =
  | { type: 'follow'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'stop'; error: unknown }
  | { type: 'none' };

/**
 * Given a caught error, the route that threw it, and how many follows have
 * already happened, whether to follow, leave the document, or stop.
 * `load` uses this for fetch-time redirects; a slot-thrown redirect happens
 * after `load` returns, so the binding must call it too.
 */
export const decideFollow = (
  error: unknown,
  requested: {
    route: Pick<RouteProps, 'path' | 'query'>;
    url: URL;
    follows: number;
  },
  options: { has404: boolean; maxFollows: number },
): FollowDecision => {
  const errorRoute = resolveErrorRoute(error, requested.url, options.has404);
  if (errorRoute.type === 'none') {
    return { type: 'none' };
  }
  if (errorRoute.type === 'unfollowable') {
    return {
      type: 'stop',
      error: new Error(`cannot follow a redirect to ${errorRoute.location}`, {
        cause: error,
      }),
    };
  }
  if (errorRoute.type === 'leave') {
    return { type: 'leave', url: errorRoute.url };
  }
  const { target, url } = errorRoute;
  if (
    isSameRscRoute(target, requested.route) &&
    url.href === requested.url.href
  ) {
    return {
      type: 'stop',
      error: new Error('detected a navigation loop', { cause: error }),
    };
  }
  if (requested.follows >= options.maxFollows) {
    return {
      type: 'stop',
      error: new Error('too many redirect or 404 follows', { cause: error }),
    };
  }
  return { type: 'follow', target, url };
};
