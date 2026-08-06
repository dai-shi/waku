import {
  unstable_createCustomError as createCustomError,
  unstable_defineHandlers as defineHandlers,
} from '../minimal/server.js';
import { createBuildHandler } from './define-router-utils/build-handler.js';
import { createConfigRegistry } from './define-router-utils/config-registry.js';
import type {
  ApiHandler,
  HandlerInterceptor,
  RuntimeConfig,
} from './define-router-utils/config.js';
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
import { createRouteEntries } from './define-router-utils/route-entries.js';
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
export type { ApiHandler, HandlerInterceptor };

export function unstable_rerenderRoute(pathname: string, query?: string) {
  const routePath = pathnameToRoutePath(pathname);
  const rscPath = encodeRoutePath(routePath);
  getRerender()(rscPath, query && new URLSearchParams({ query }));
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

export function unstable_defineRouter(fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) {
  const configRegistry = createConfigRegistry(fns.getConfigs);
  const routeEntries = createRouteEntries(configRegistry);

  const runHandled = <T,>(req: Request, fn: () => Promise<T>): Promise<T> =>
    runWithRouterStore(
      { req, resolveSearchCodec: configRegistry.resolveSearchCodec },
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      ),
    );

  const handleRequest = createRequestHandler({
    configRegistry,
    routeEntries,
    runHandled,
  });

  const handleBuild = createBuildHandler({
    configRegistry,
    routeEntries,
    runHandled,
    skipBuild: fns.unstable_skipBuild,
  });

  return Object.assign(defineHandlers({ handleRequest, handleBuild }), {
    unstable_getRouterConfigs: async () => configRegistry.getAll(),
  });
}
