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
} from './define-router-utils/config-types.js';
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
 * Redirect within the current application. Accepts the same target as
 * `router.push` / `router.replace`: a typed route href or a structured
 * `{ to, params, search, hash }`. The resolved location must start with a
 * single `/`.
 */
export function unstable_redirect<Path extends RoutePath = RoutePath>(
  to: RouteHref | BuildRouteHrefTarget<Path>,
  status: 303 | 307 | 308 = 307,
): never {
  const location =
    typeof to === 'string' ? to : buildRouteHref(to, getResolveSearchCodec());
  if (!location.startsWith('/') || location.startsWith('//')) {
    throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
  }
  for (let i = 0; i < location.length; ++i) {
    const charCode = location.charCodeAt(i);
    if (charCode < 0x20 || charCode === 0x7f || charCode === 0x5c) {
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
