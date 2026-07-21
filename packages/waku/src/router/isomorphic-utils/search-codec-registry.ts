/**
 * Bring-your-own search-params codec: converts the URL's `query` string to a
 * typed `search` object and back, identified by a stable `id`. Waku provides
 * this contract and the integration; the implementation (a library, an adapter
 * for nuqs/zod, or a hand-written object) lives outside core. `parse` may throw
 * to reject a malformed query (the framework turns it into a 400). `serialize`
 * must return an already URL-encoded query string (e.g. via
 * `URLSearchParams.toString()`); it is placed after `?` in the href as-is.
 */
export type Unstable_SearchCodec<Search extends Record<string, unknown>> = {
  id: string;
  parse: (query: string) => Search;
  serialize: (search: Search) => string;
};

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
