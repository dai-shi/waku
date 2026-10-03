import {
  unstable_formatRscUrl as formatRscUrl,
  unstable_parseRequest as parseRequest,
} from 'waku/minimal/server';
import {
  addBase,
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';

const getBasePath = () => import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/';
const RSC_QUERY_PARAM = 'query';

type RouterRequest =
  | { type: 'route'; path: string; query: string | undefined }
  | { type: 'slice'; id: string }
  | { type: 'action' };

/**
 * Reads a request the way `waku/router` will, so middleware can match on a
 * route path rather than Waku's RSC url shape: a document request and the RSC
 * request for the same route both report that route.
 *
 * Returns `null` outside `basePath`, or for an RSC url that does not decode.
 * `query` is `undefined` when the router's params travel in the request body,
 * out of reach without consuming it.
 *
 * A path rule is an optimistic redirect, not an authorization boundary: it
 * cannot see a client-dispatched action, though a form posted without
 * JavaScript reports as the route it posts to.
 */
export function parseRouterRequest(req: Request): RouterRequest | null {
  const input = parseRequest(req);
  if (!input) {
    return null;
  }
  if (input.type === 'http') {
    return {
      type: 'route',
      path: pathnameToRoutePath(input.pathname),
      query: input.searchParams.toString(),
    };
  }
  if (input.type === 'call') {
    return { type: 'action' };
  }
  const { rscPath, rscParams } = input;
  const query = rscParams ? (rscParams.get(RSC_QUERY_PARAM) ?? '') : undefined;
  const sliceId = decodeSliceId(rscPath);
  if (sliceId !== null) {
    return { type: 'slice', id: sliceId };
  }
  try {
    return { type: 'route', path: decodeRoutePath(rscPath), query };
  } catch {
    return null;
  }
}

/**
 * The url that addresses `routePath` the way `req` addressed its own route, so
 * a rewrite returns the kind of response the caller expects: a document for a
 * document request, an RSC payload for an RSC one.
 *
 * Returns `null` when `req` is not a route request, and when it carries the
 * router's params in its body — a redirect drops that body, and `query`
 * replaces the route query alone. Leave such a request as it is.
 */
export function formatRouterRequest(
  req: Request,
  routePath: string,
  query?: string,
): URL | null {
  const parsed = parseRouterRequest(req);
  if (parsed?.type !== 'route' || parsed.query === undefined) {
    return null;
  }
  const isRscRequest = parseRequest(req)?.type === 'rsc';
  const canonicalPath = pathnameToRoutePath(routePath);
  const url = isRscRequest
    ? formatRscUrl(encodeRoutePath(canonicalPath), req.url)
    : new URL(req.url);
  const nextQuery = query ?? parsed.query;
  if (isRscRequest) {
    url.searchParams.set(RSC_QUERY_PARAM, nextQuery);
  } else {
    url.pathname = addBase(canonicalPath, getBasePath());
    url.search = nextQuery;
  }
  return url;
}
