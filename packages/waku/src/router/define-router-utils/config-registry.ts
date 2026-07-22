import {
  getPathMapping,
  pathSpecAsString,
} from '../isomorphic-utils/path-spec.js';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec-registry.js';
import { DEFINE_ROUTER_METADATA } from './build-metadata.js';
import { mergeWithRuntimeConfigs } from './config-serialization.js';
import type {
  RuntimeConfig,
  SerializableConfig,
  SliceConfig,
} from './config-types.js';
import { assertNonReservedSlotId } from './element-cache.js';

const is404 = (pathSpec: PathSpec) =>
  pathSpec.length === 1 &&
  pathSpec[0]!.type === 'literal' &&
  pathSpec[0]!.name === '404';

export type ConfigRegistry = ReturnType<typeof createConfigRegistry>;

export const createConfigRegistry = (
  getConfigs: () => Promise<Iterable<RuntimeConfig>>,
) => {
  let cachedConfigs: RuntimeConfig[] | undefined;
  let cachedHas404 = false;
  let cachedRoutePath2searchCodec:
    Map<string, Unstable_SearchCodec<any>> | undefined;
  let initPromise: Promise<void> | undefined;

  const load = async (
    loadBuildMetadata?: (key: string) => Promise<string | undefined>,
  ) => {
    const runtimeConfigs = Array.from(await getConfigs());
    let configs: RuntimeConfig[] = runtimeConfigs;
    if (loadBuildMetadata) {
      const raw = await loadBuildMetadata(
        DEFINE_ROUTER_METADATA.serializableConfigs,
      );
      if (raw) {
        const serializableConfigs = JSON.parse(raw) as SerializableConfig[];
        configs = mergeWithRuntimeConfigs(serializableConfigs, runtimeConfigs);
      }
    }
    configs.forEach((item) => {
      if (item.type === 'route') {
        Object.keys(item.elements).forEach(assertNonReservedSlotId);
      } else if (item.type === 'slice') {
        if (item.isStatic && item.pathSpec) {
          throw new Error(
            `defineRouter: static slice "${item.id}" cannot have a pathSpec`,
          );
        }
      }
    });
    cachedConfigs = configs;
    cachedHas404 = configs.some(
      (item) => item.type === 'route' && is404(item.path),
    );
  };

  // A single cached promise so concurrent and repeated calls share one load;
  // a failed load resets it so a later call can retry.
  const initialize = (
    loadBuildMetadata?: (key: string) => Promise<string | undefined>,
  ): Promise<void> =>
    (initPromise ??= load(loadBuildMetadata).catch((e) => {
      initPromise = undefined;
      throw e;
    }));

  const getAll = (): RuntimeConfig[] => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedConfigs;
  };

  const has404 = (): boolean => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedHas404;
  };

  const resolveSearchCodec = (
    routePath: string,
  ): Unstable_SearchCodec<any> | undefined => {
    if (!cachedRoutePath2searchCodec) {
      cachedRoutePath2searchCodec = new Map();
      for (const item of getAll()) {
        if (item.type === 'route' && item.searchCodec) {
          cachedRoutePath2searchCodec.set(
            pathSpecAsString(item.pathPattern ?? item.path),
            item.searchCodec,
          );
        }
      }
    }
    return cachedRoutePath2searchCodec.get(routePath);
  };

  const findPathConfig = (pathname: string) => {
    const routePath = pathnameToRoutePath(pathname);
    return getAll().find(
      (item): item is typeof item & { type: 'route' | 'api' } =>
        (item.type === 'route' || item.type === 'api') &&
        !!getPathMapping(item.path, routePath),
    );
  };

  const findSliceConfig = (
    sliceId: string,
  ):
    | { sliceConfig: SliceConfig; params?: Record<string, string | string[]> }
    | undefined => {
    const slicePath = '/' + sliceId;
    for (const item of getAll()) {
      if (item.type !== 'slice') {
        continue;
      }
      if (item.id === sliceId) {
        return { sliceConfig: item };
      }
      if (item.pathSpec) {
        const params = getPathMapping(item.pathSpec, slicePath);
        if (params) {
          return { sliceConfig: item, params };
        }
      }
    }
    return undefined;
  };

  return {
    initialize,
    getAll,
    has404,
    resolveSearchCodec,
    findPathConfig,
    findSliceConfig,
  };
};
