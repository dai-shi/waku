import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';
import type { Unstable_Handlers as Handlers } from 'waku/minimal/server';
import { createBuildHandler } from './define-router-utils/build-handler.js';
import type { ElementCache } from './define-router-utils/element-cache.js';
import { createRequestHandler } from './define-router-utils/request-handler.js';
import {
  getHeaders,
  getRequest,
  getRerender,
  getResolveSearchCodec,
  getRscParams,
  getRscPath,
  runWithRouterStore,
  setNonce,
} from './define-router-utils/request-store.js';
import type {
  HandlerInterceptor,
  RouterStore,
} from './define-router-utils/request-store.js';
import { createRouteEntries } from './define-router-utils/route-entries.js';
import type {
  Resolve,
  ResolveElement,
} from './define-router-utils/route-entries.js';
import { buildRouteHref } from './isomorphic-utils/build-route-href.js';
import type {
  BuildRouteHrefTarget,
  RouteHref,
  RoutePath,
} from './isomorphic-utils/build-route-href.js';
import {
  encodeRoutePath,
  pathnameToRoutePath,
} from './isomorphic-utils/route-path.js';

export {
  getRequest as unstable_getRequest,
  getHeaders as unstable_getHeaders,
  getRscPath as unstable_getRscPath,
  getRscParams as unstable_getRscParams,
  setNonce as unstable_setNonce,
};
export type { HandlerInterceptor };

const encodePathname = (pathname: string) => {
  if (!pathname.startsWith('/')) {
    throw new Error('Pathname must start with `/`: ' + pathname);
  }
  const url = new URL('http://localhost');
  url.pathname = pathname;
  return url.pathname;
};

/**
 * Renders the route the current server action was called from into its
 * response. The client drops it if the user has left that route by then.
 */
export function unstable_rerenderRoute(): void;
/**
 * Renders a route into the response of the current server action. `pathname`
 * is serialized as a URL pathname, so dot segments are resolved and unescaped
 * non-ASCII characters are percent-encoded. `query` is the search string
 * without `?`, serialized as URL search params, so `q=a b` becomes `q=a+b`.
 */
export function unstable_rerenderRoute(pathname: string, query?: string): void;
export function unstable_rerenderRoute(pathname?: string, query?: string) {
  if (pathname === undefined) {
    getRerender()();
    return;
  }
  const rscPath = encodeRoutePath(
    pathnameToRoutePath(encodePathname(pathname)),
  );
  const encodedQuery = new URLSearchParams(query).toString();
  getRerender()(
    rscPath,
    encodedQuery && new URLSearchParams({ query: encodedQuery }),
  );
}

export function unstable_notFound(): never {
  throw createCustomError('Not Found', { status: 404 });
}

/**
 * Redirect within the app, or away from it with an absolute http or https url.
 * A `URL` is the way to pass one that is not a literal. Where it points is not
 * validated, so check a target built from user input against your own
 * allowlist.
 *
 * An absolute url navigates the document even when it names this origin, so
 * pass a path to stay within the app. A form submission without JavaScript is
 * followed by the browser, which resends the body on 307 and 308, so those
 * answer 303 instead.
 */
export function unstable_redirect<Path extends RoutePath = RoutePath>(
  to:
    | RouteHref
    | `http://${string}`
    | `https://${string}`
    | URL
    | BuildRouteHrefTarget<Path>,
  status: 303 | 307 | 308 = 307,
): never {
  let location =
    typeof to === 'string'
      ? to
      : to instanceof URL
        ? to.href
        : buildRouteHref(to, getResolveSearchCodec());
  const leavesTheApp =
    location.startsWith('http://') || location.startsWith('https://');
  if (
    leavesTheApp
      ? !URL.canParse(location)
      : !location.startsWith('/') || location.startsWith('//')
  ) {
    throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
  }
  if (leavesTheApp) {
    // a redirect thrown mid stream reaches the client as this digest, before
    // anything resolves it
    const url = new URL(location);
    url.username = '';
    url.password = '';
    location = url.href;
  }
  for (let i = 0; i < location.length; ++i) {
    const charCode = location.charCodeAt(i);
    const isBackslash = charCode === 0x5c;
    if (
      charCode < 0x20 ||
      charCode === 0x7f ||
      (isBackslash && !leavesTheApp)
    ) {
      throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
    }
  }
  throw createCustomError('Redirect', { status, location });
}

type RouterOptions = {
  resolve: Resolve;
  getBuildPaths?: () => Promise<Iterable<string>>;
  getBuildElementIds?: () => Promise<Iterable<string>>;
  resolveElement?: ResolveElement;
  unstable_interceptors?: HandlerInterceptor[];
};

export const createRouterHandlers = (
  fns: RouterOptions,
  routeEntries: ReturnType<typeof createRouteEntries>,
  integration?: {
    elementCache?: ElementCache;
    getExtraScriptContent?: () => Promise<string>;
    resolveSearchCodec?: RouterStore['resolveSearchCodec'];
  },
): Handlers => {
  const runHandled = <T,>(req: Request, fn: () => Promise<T>): Promise<T> =>
    runWithRouterStore(
      {
        req,
        resolveSearchCodec:
          integration?.resolveSearchCodec ?? getResolveSearchCodec(),
      },
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      ),
    );
  const handleRequest = createRequestHandler({
    resolve: fns.resolve,
    routeEntries,
    runHandled,
    ...integration,
  });
  const handleBuild = createBuildHandler({
    resolve: fns.resolve,
    getBuildPaths: fns.getBuildPaths,
    getBuildElementIds: fns.getBuildElementIds,
    routeEntries,
    runHandled,
  });
  return { handleRequest, handleBuild };
};

/**
 * Creates server handlers for `waku/router/client`. `resolve` receives the
 * normalized pathname and query string without `?`, and returns element
 * sources with `root` and `route`, an HTTP handler, or `null` for not found.
 * The document root uses `Children_UNSTABLE` to place the active route.
 *
 * `getBuildPaths` lists concrete paths: immutable routes are prerendered, HTTP
 * handlers emit static responses, and mutable routes cache only immutable
 * elements. `resolveElement` handles `slice:<id>` requests from client `Slice`
 * components; `getBuildElementIds` lists immutable IDs to emit as standalone
 * RSC files. Only `slice:<id>` IDs are supported for standalone requests.
 * Unresolved or mutable build IDs fail the build.
 * Runtime route content is reused only from build-preloaded entries.
 * Custom 404 availability is checked once per router instance.
 * Immutable sources must render the same content for the lifetime of their ID.
 */
export function unstable_defineRouter(fns: RouterOptions): Handlers {
  return createRouterHandlers(
    fns,
    createRouteEntries(fns.resolve, fns.resolveElement),
  );
}
