import type { Unstable_Handlers as Handlers } from 'waku/minimal/server';
import { runWithRouterStore } from '../define-router-utils/request-store.js';
import type { HandlerInterceptor } from '../define-router-utils/request-store.js';
import { createRouterHandlers } from '../define-router.js';
import {
  getSliceSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import { createBuildHandler } from './build-handler.js';
import { setupRouterSearchCodecs } from './client-code.js';
import { createConfigRegistry } from './config-registry.js';
import type { RuntimeConfig } from './config.js';
import { createElementCache } from './element-cache.js';
import { createRouteEntries, createRouteResolver } from './route-entries.js';

export const createConfiguredRouter = (fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) => {
  const registry = createConfigRegistry(fns.getConfigs);
  const cache = createElementCache();
  const resolver = createRouteResolver(registry, cache);
  const routeEntries = createRouteEntries(registry);

  const router = createRouterHandlers(
    {
      resolve: resolver.resolve,
      ...(fns.unstable_interceptors && {
        unstable_interceptors: fns.unstable_interceptors,
      }),
    },
    {
      getEntriesForRoute: routeEntries.getEntriesForRoute,
      getEntriesForElement: (id, cache) =>
        isSliceSlotId(id)
          ? routeEntries.getEntriesForSlice(
              id.slice(getSliceSlotId('').length),
              cache,
            )
          : Promise.resolve(null),
      has404: async () => registry.has404(),
    },
    {
      elementCache: cache,
      resolveSearchCodec: registry.resolveSearchCodec,
      getExtraScriptContent: async () =>
        setupRouterSearchCodecs(registry.getAll()),
    },
  );

  const handleRequest: Handlers['handleRequest'] = async (input, utils) => {
    await registry.initialize(utils.loadBuildMetadata);
    return router.handleRequest(input, utils);
  };

  const handleBuild = createBuildHandler({
    configRegistry: registry,
    routeEntries,
    runHandled: (req, fn) =>
      runWithRouterStore(
        { req, resolveSearchCodec: registry.resolveSearchCodec },
        (fns.unstable_interceptors ?? []).reduceRight(
          (next, interceptor) => () => interceptor(next),
          fn,
        ),
      ),
    skipBuild: fns.unstable_skipBuild,
  });
  return {
    handleRequest,
    handleBuild,
    unstable_getRouterConfigs: async () => registry.getAll(),
  };
};
