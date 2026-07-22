import type { ReactNode } from 'react';
import { unstable_buildElements as buildElements } from '../../minimal/server.js';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from '../../minimal/server.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
} from '../isomorphic-utils/route-path.js';
import type { ConfigRegistry } from './config-registry.js';
import type {
  GetEtagFromParams,
  RendererOption,
  SliceConfig,
  SlotId,
} from './config-types.js';
import {
  ROOT_SLOT_ID,
  ROUTE_SLOT_ID_PREFIX,
  SLICE_SLOT_ID_PREFIX,
  getPathSpecCacheId,
  getSlotCacheId,
} from './element-cache.js';
import type { CacheId, ElementCache } from './element-cache.js';
import { setRscParams, setRscPath } from './request-store.js';

export type RouteEntries = {
  elements: Record<string, unknown>;
  etags: Etags;
};

const parseRscParams = (
  rscParams: unknown,
): {
  query: string;
} => {
  if (rscParams instanceof URLSearchParams) {
    return { query: rscParams.get('query') || '' };
  }
  if (
    typeof (rscParams as { query?: undefined } | undefined)?.query === 'string'
  ) {
    return { query: (rscParams as { query: string }).query };
  }
  return { query: '' };
};

const bindEtag = <A,>(
  getEtag: ((arg: A) => Promise<string | undefined>) | undefined,
  arg: A,
): (() => Promise<string | undefined>) | undefined =>
  getEtag && (() => getEtag(arg));

export const createRouteEntries = (configRegistry: ConfigRegistry) => {
  const getSliceElement = async (
    sliceConfig: {
      id: string;
      isStatic: boolean;
      renderer: (
        params?: Record<string, string | string[]>,
      ) => Promise<ReactNode>;
    },
    elementCache: ElementCache,
    concreteId?: string,
    params?: Record<string, string | string[]>,
  ): Promise<ReactNode> => {
    const slotId = SLICE_SLOT_ID_PREFIX + (concreteId ?? sliceConfig.id);
    const cacheId = getSlotCacheId(slotId);
    const cached = elementCache.get(cacheId);
    if (cached) {
      return cached;
    }
    const element = await sliceConfig.renderer(params);
    if (sliceConfig.isStatic) {
      await elementCache.set(cacheId, element);
      return elementCache.get(cacheId);
    }
    return element;
  };

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    clientEtags: Etags,
    elementCache: ElementCache,
  ): Promise<RouteEntries | null> => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const routePath = decodeRoutePath(rscPath);
    const pathConfigItem = configRegistry.findPathConfig(routePath);
    if (pathConfigItem?.type !== 'route') {
      return null;
    }
    const { query } = parseRscParams(rscParams);
    const routeId = ROUTE_SLOT_ID_PREFIX + routePath;
    const routeTemplateCacheId = getPathSpecCacheId(pathConfigItem.path);
    const option: RendererOption = {
      routePath,
      query: pathConfigItem.isStatic ? undefined : query,
    };
    const slices = pathConfigItem.slices || [];
    const sliceConfigMap = new Map<
      string,
      {
        id: string;
        isStatic: boolean;
        renderer: (
          params?: Record<string, string | string[]>,
        ) => Promise<ReactNode>;
        getEtagFromParams?: GetEtagFromParams;
        params?: Record<string, string | string[]>;
      }
    >();
    slices.forEach((sliceId) => {
      const found = configRegistry.findSliceConfig(sliceId);
      if (found) {
        sliceConfigMap.set(sliceId, {
          ...found.sliceConfig,
          ...(found.params ? { params: found.params } : {}),
        });
      }
    });
    const makeElementSource = (
      isStatic: boolean,
      cacheId: CacheId,
      render: () => ReactNode | Promise<ReactNode>,
      getEtag?: () => Promise<string | undefined>,
    ): ElementSource =>
      isStatic
        ? {
            immutable: true,
            render: async () => {
              if (!elementCache.get(cacheId)) {
                await elementCache.set(cacheId, await render());
              }
              return elementCache.get(cacheId);
            },
          }
        : { getEtag, render };
    const elementSources: Record<SlotId, ElementSource> = {
      [ROOT_SLOT_ID]: makeElementSource(
        pathConfigItem.rootElement.isStatic,
        getSlotCacheId(ROOT_SLOT_ID),
        () => pathConfigItem.rootElement.renderer(option),
        bindEtag(pathConfigItem.rootElement.getEtagFromOption, option),
      ),
      [routeId]: makeElementSource(
        pathConfigItem.routeElement.isStatic,
        routeTemplateCacheId,
        () => pathConfigItem.routeElement.renderer(option),
        bindEtag(pathConfigItem.routeElement.getEtagFromOption, option),
      ),
    };
    for (const [id, el] of Object.entries(pathConfigItem.elements)) {
      elementSources[id] = makeElementSource(
        el.isStatic,
        getSlotCacheId(id),
        () => el.renderer(option),
        bindEtag(el.getEtagFromOption, option),
      );
    }
    for (const sliceId of slices) {
      const sliceConfig = sliceConfigMap.get(sliceId);
      if (!sliceConfig) {
        throw new Error(`Slice not found: ${sliceId}`);
      }
      elementSources[SLICE_SLOT_ID_PREFIX + sliceId] = makeElementSource(
        sliceConfig.isStatic,
        getSlotCacheId(SLICE_SLOT_ID_PREFIX + sliceId),
        () => sliceConfig.renderer(sliceConfig.params),
        bindEtag(sliceConfig.getEtagFromParams, sliceConfig.params),
      );
    }
    const { elements, etags } = await buildElements(
      clientEtags,
      elementSources,
    );
    elements[ROUTE_ID] = [routePath, query];
    elements[IS_STATIC_ID] = pathConfigItem.isStatic;
    if (configRegistry.has404()) {
      elements[HAS404_ID] = true;
    }
    return { elements, etags };
  };

  // LIMITATION: This is a single slice request.
  // Ideally, we should be able to respond with multiple slices in one request.
  // The skip header is not consulted here (clientEtags is empty); the etag skip
  // only covers route-bundled slices. The etag is still sent to keep the
  // client's tag fresh.
  const getEntriesForSlice = async (
    sliceId: string,
    elementCache: ElementCache,
    preResolved?: {
      sliceConfig: SliceConfig;
      params?: Record<string, string | string[]>;
    },
  ): Promise<RouteEntries | null> => {
    const found = preResolved ?? configRegistry.findSliceConfig(sliceId);
    if (!found) {
      return null;
    }
    const { sliceConfig, params: sliceParams } = found;
    const sliceSlotId = SLICE_SLOT_ID_PREFIX + sliceId;
    return buildElements(
      {},
      {
        [sliceSlotId]: {
          immutable: sliceConfig.isStatic,
          getEtag: bindEtag(sliceConfig.getEtagFromParams, sliceParams),
          render: () =>
            getSliceElement(sliceConfig, elementCache, sliceId, sliceParams),
        },
      },
    );
  };

  return { getEntriesForRoute, getEntriesForSlice };
};
