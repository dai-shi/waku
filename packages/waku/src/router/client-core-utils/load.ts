import { unstable_fetchRsc as fetchRsc } from '../../minimal/client.js';
import { encodeRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { canReuseStaticRoute, createRscParams, getPrefetch } from './caches.js';
import { MAX_FOLLOWS_PER_NAVIGATION, decideFollow } from './error-route.js';
import { getRouteUrl, isSameRscRoute } from './route-url.js';

type Elements = Record<string | symbol, unknown>;

export type LoadOutcome =
  | {
      type: 'loaded';
      route: RouteProps;
      url: URL;
      elements: Elements;
      follows: number;
      adopted: boolean;
    }
  | { type: 'reused'; route: RouteProps; url: URL; follows: number }
  | {
      type: 'external';
      url: URL;
      error: unknown;
      // last attempt, so the binding can commit that url before leaving
      route: RouteProps;
      from: URL;
      follows: number;
    }
  | {
      type: 'failed';
      route: RouteProps;
      url: URL;
      error: unknown;
      follows: number;
    }
  | { type: 'aborted' };

export type Loaded = Extract<LoadOutcome, { type: 'loaded' }>;

export type LoadOptions = {
  signal: AbortSignal;
  refetch?: boolean;
  adopt?: Promise<Elements>;
  onBuildIdMismatch?: (url: URL) => void;
  onInvalidate?: (url: URL) => void;
  has404: boolean;
  settled: RouteProps;
  // fetch base for etags, not a store write
  base: Elements;
  url?: URL;
  follows?: number;
};

export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};

export const load = async (
  requested: RouteProps,
  opts: LoadOptions,
): Promise<LoadOutcome> => {
  const initialFollows = opts.follows ?? 0;
  const initialUrl = opts.url ?? getRouteUrl(requested);

  const run = async (attempt: {
    route: RouteProps;
    url: URL;
    follows: number;
  }): Promise<LoadOutcome> => {
    if (opts.signal.aborted) {
      return { type: 'aborted' };
    }
    const isFirstAttempt = attempt.follows === initialFollows;
    // changeRoute pre-checks this; unreachable from there, used by follows and adopt
    if (
      canReuseStaticRoute(attempt.route, opts.base) ||
      (isFirstAttempt && opts.refetch === false)
    ) {
      return {
        type: 'reused',
        route: attempt.route,
        url: attempt.url,
        follows: attempt.follows,
      };
    }
    const cached = getPrefetch(attempt.route);
    const unsubscribeInvalidate = cached?.onInvalidate(() => {
      if (!opts.signal.aborted) {
        opts.onInvalidate?.(attempt.url);
      }
    });
    const useAdopt = isFirstAttempt && opts.adopt !== undefined;
    const adoptedPromise = opts.adopt;
    const onBuildIdMismatch = opts.onBuildIdMismatch;
    let elements: Elements;
    let adopted = false;
    try {
      if (useAdopt && adoptedPromise) {
        elements = await abortable(adoptedPromise, opts.signal);
        adopted = true;
      } else {
        const rscPath = encodeRoutePath(attempt.route.path);
        elements = cached
          ? await abortable(cached.promise, opts.signal)
          : await fetchRsc(rscPath, createRscParams(attempt.route.query), {
              signal: opts.signal,
              // a defined wrapper disables minimal's reload default
              ...(onBuildIdMismatch
                ? {
                    onBuildIdMismatch: () => onBuildIdMismatch(attempt.url),
                  }
                : {}),
              unstable_base: opts.base,
            });
      }
      if (opts.signal.aborted) {
        return { type: 'aborted' };
      }
      return {
        type: 'loaded',
        route: attempt.route,
        url: attempt.url,
        elements,
        follows: attempt.follows,
        adopted,
      };
    } catch (error) {
      if (opts.signal.aborted) {
        return { type: 'aborted' };
      }
      const decision = decideFollow(error, attempt, {
        has404: opts.has404,
        maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
      });
      if (decision.type === 'leave') {
        return {
          type: 'external',
          url: decision.url,
          error,
          route: attempt.route,
          from: attempt.url,
          follows: attempt.follows,
        };
      }
      if (decision.type !== 'follow') {
        return {
          type: 'failed',
          route: attempt.route,
          url: attempt.url,
          error: decision.type === 'stop' ? decision.error : error,
          follows: attempt.follows,
        };
      }
      const nextAttempt = {
        route: decision.target,
        url: decision.url,
        follows: attempt.follows + 1,
      };
      if (
        initialFollows === 0 &&
        isSameRscRoute(decision.target, attempt.route) &&
        isSameRscRoute(decision.target, opts.settled)
      ) {
        return {
          type: 'reused',
          route: nextAttempt.route,
          url: nextAttempt.url,
          follows: nextAttempt.follows,
        };
      }
      return run(nextAttempt);
    } finally {
      // an aborted load must not stay reachable from a long-lived prefetch
      unsubscribeInvalidate?.();
    }
  };

  return run({
    route: requested,
    url: initialUrl,
    follows: initialFollows,
  });
};
