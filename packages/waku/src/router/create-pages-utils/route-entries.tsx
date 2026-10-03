import { unstable_buildElements as buildElements } from 'waku/minimal/server';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from 'waku/minimal/server';
import { cacheElementSource } from '../define-router-utils/element-cache.js';
import { createRouteEntries as createResolvedRouteEntries } from '../define-router-utils/route-entries.js';
import type { Resolve, Route } from '../define-router-utils/route-entries.js';
import { getPathMapping } from '../isomorphic-utils/path-spec.js';
import {
  getSliceSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import type { ConfigRegistry } from './config-registry.js';
import type { RendererOption } from './config.js';
import { getPathSpecCacheId, getSlotCacheId } from './element-cache.js';
import type { ElementCache } from './element-cache.js';

export const createRouteResolver = (
  registry: ConfigRegistry,
  cache: ElementCache,
) => {
  const resolveElement = async (
    id: string,
    preResolved?: NonNullable<ReturnType<ConfigRegistry['findSliceConfig']>>,
  ): Promise<ElementSource | null> => {
    if (!isSliceSlotId(id)) {
      return null;
    }
    const found =
      preResolved ?? registry.findSliceConfig(id.slice('slice:'.length));
    if (!found) {
      return null;
    }
    const { sliceConfig, params } = found;
    return {
      immutable: sliceConfig.isStatic,
      render: () => sliceConfig.renderer(params),
      ...(sliceConfig.getEtagFromParams && {
        getEtag: () => sliceConfig.getEtagFromParams!(params),
      }),
    };
  };

  const resolve: Resolve = async (pathname, query) => {
    const config = registry.findPathConfig(pathname);
    if (!config) {
      return null;
    }
    if (config.type === 'api') {
      const params = getPathMapping(config.path, pathname) ?? {};
      return (req) => config.handler(req, { params });
    }
    const option: RendererOption = {
      routePath: pathname,
      query: config.isStatic ? undefined : query,
    };
    const bind = (spec: typeof config.rootElement): ElementSource => ({
      immutable: spec.isStatic,
      render: () => spec.renderer(option),
      ...(spec.getEtagFromOption && {
        getEtag: () => spec.getEtagFromOption!(option),
      }),
    });
    const elements: Route['elements'] = {
      root: bind(config.rootElement),
      route: cacheElementSource(
        bind(config.routeElement),
        getPathSpecCacheId(config.path),
        cache,
      ),
      ...Object.fromEntries(
        Object.entries(config.elements).map(([id, spec]) => [id, bind(spec)]),
      ),
    };
    for (const id of config.slices || []) {
      const source = await resolveElement(getSliceSlotId(id));
      if (!source) {
        throw new Error('Slice not found: ' + id);
      }
      elements[getSliceSlotId(id)] = source;
    }
    return { elements, ...(config.noSsr && { noSsr: true }) };
  };
  return { resolve, resolveElement };
};

export const createRouteEntries = (registry: ConfigRegistry) => {
  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    clientEtags: Etags,
    cache: ElementCache,
  ) => {
    const resolver = createRouteResolver(registry, cache);
    return createResolvedRouteEntries(
      resolver.resolve,
      resolver.resolveElement,
      async () => registry.has404(),
    ).getEntriesForRoute(rscPath, rscParams, clientEtags, cache);
  };
  const getEntriesForSlice = async (
    id: string,
    cache: ElementCache,
    preResolved?: NonNullable<ReturnType<ConfigRegistry['findSliceConfig']>>,
  ) => {
    const slotId = getSliceSlotId(id);
    const source = await createRouteResolver(registry, cache).resolveElement(
      slotId,
      preResolved,
    );
    return source
      ? buildElements(
          {},
          {
            [slotId]: cacheElementSource(source, getSlotCacheId(slotId), cache),
          },
        )
      : null;
  };
  return { getEntriesForRoute, getEntriesForSlice };
};
