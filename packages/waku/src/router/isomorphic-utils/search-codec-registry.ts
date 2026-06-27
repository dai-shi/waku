import type { Unstable_SearchCodec } from '../create-pages-utils/inferred-path-types.js';

export type AnyCodec = Unstable_SearchCodec<any>;

export const isCodec = (value: unknown): value is AnyCodec =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AnyCodec).id === 'string' &&
  typeof (value as AnyCodec).parse === 'function' &&
  typeof (value as AnyCodec).serialize === 'function';

/**
 * Resolve a route path to its search codec id, using the `route -> codec id`
 * map that define-router ships as `globalThis.__WAKU_ROUTER_SEARCH_CODECS__`.
 * Lets `push`/`Link` serialize `search` for any route, not just the current one.
 */
export const getRouteSearchCodecId = (
  routePath: string,
): string | undefined => {
  const map = (
    globalThis as {
      __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string>;
    }
  ).__WAKU_ROUTER_SEARCH_CODECS__;
  return map?.[routePath];
};
