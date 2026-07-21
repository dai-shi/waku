import type { ReactNode } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  unstable_base64ToBytes as base64ToBytes,
  unstable_buildElements as buildElements,
  unstable_bytesToBase64 as bytesToBase64,
  unstable_createCustomError as createCustomError,
  unstable_defineHandlers as defineHandlers,
  unstable_getErrorInfo as getErrorInfo,
} from '../minimal/server.js';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from '../minimal/server.js';
import { deserializeRsc, serializeRsc } from '../server.js';
import { INTERNAL_ServerRouter } from './client.js';
import type { Unstable_SearchCodec } from './create-pages-utils/inferred-path-types.js';
import { path2regexp } from './define-router-utils/path-spec.js';
import { createTaskRunner } from './define-router-utils/task-runner.js';
import { buildRouteHref } from './isomorphic-utils/build-route-href.js';
import type {
  BuildRouteHrefTarget,
  RouteHref,
  RoutePath,
} from './isomorphic-utils/build-route-href.js';
import {
  getPathMapping,
  pathSpecAsString,
} from './isomorphic-utils/path-spec.js';
import type { PathSpec } from './isomorphic-utils/path-spec.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  encodeSliceId,
  pathnameToRoutePath,
} from './isomorphic-utils/route-path.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

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

export type HandlerInterceptor = <T>(next: () => Promise<T>) => Promise<T>;

type Rerender = (rscPath: string, rscParams?: unknown) => void;

type RouterStore = {
  req: Request;
  rscPath?: string;
  rscParams?: unknown;
  rerender?: Rerender;
  nonce?: string;
  resolveSearchCodec?: (
    routePath: string,
  ) => Unstable_SearchCodec<any> | undefined;
};
const routerStorage = new AsyncLocalStorage<RouterStore>();

/**
 * Access the request being handled. Available during a render, an API route
 * handler, or a handler interceptor (request and build phases). Throws if called
 * outside that scope.
 */
export function unstable_getRequest(): Request {
  const store = routerStorage.getStore();
  if (!store) {
    throw new Error('Request is not available.');
  }
  return store.req;
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return Object.fromEntries(unstable_getRequest().headers.entries());
}

const setRscPath = (rscPath: string) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rscPath = rscPath;
  }
};

const setRscParams = (rscParams: unknown) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rscParams = rscParams;
  }
};

export function unstable_getRscPath(): string | undefined {
  return routerStorage.getStore()?.rscPath;
}

export function unstable_getRscParams(): unknown {
  return routerStorage.getStore()?.rscParams;
}

const setRerender = (rerender: Rerender) => {
  const store = routerStorage.getStore();
  if (store) {
    store.rerender = rerender;
  }
};

const getRerender = (): Rerender => {
  const rerender = routerStorage.getStore()?.rerender;
  if (!rerender) {
    throw new Error('Rerender is not available.');
  }
  return rerender;
};

/**
 * Set the nonce applied to framework inline scripts for the current request.
 * Call this from a handler interceptor (e.g. bridging a Hono middleware's
 * generated nonce) before rendering.
 */
export function unstable_setNonce(nonce: string): void {
  const store = routerStorage.getStore();
  if (store) {
    store.nonce = nonce;
  }
}

const getNonce = (): string | undefined => routerStorage.getStore()?.nonce;

const is404 = (pathSpec: PathSpec) =>
  pathSpec.length === 1 &&
  pathSpec[0]!.type === 'literal' &&
  pathSpec[0]!.name === '404';

const pathSpecToRoutePath = (pathSpec: PathSpec) => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    return undefined;
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

const routePathToHtmlFilePath = (routePath: string): string =>
  routePath === '/404' ? '404.html' : routePath + '/index.html';

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
    typeof to === 'string'
      ? to
      : buildRouteHref(to, routerStorage.getStore()?.resolveSearchCodec);
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

type SlotId = string;

type RouteEntries = {
  elements: Record<string, unknown>;
  etags: Etags;
};

const ROOT_SLOT_ID = 'root';
const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

type CacheId = string;

const createElementCache = (
  onSerialize?: (cacheId: CacheId, serialized: string) => void,
) => {
  const cache = new Map<CacheId, Promise<Uint8Array>>();
  return {
    preload: (cacheId: CacheId, bytes: Uint8Array) => {
      cache.set(cacheId, Promise.resolve(bytes));
    },
    get: (cacheId: CacheId) => {
      const cachedBytes = cache.get(cacheId);
      if (!cachedBytes) {
        return undefined;
      }
      return cachedBytes.then((bytes) =>
        deserializeRsc(bytes),
      ) as Promise<ReactNode>;
    },
    set: (cacheId: CacheId, element: ReactNode) => {
      if (cache.has(cacheId)) {
        return;
      }
      const bytesPromise = serializeRsc(element);
      cache.set(cacheId, bytesPromise);
      if (onSerialize) {
        return bytesPromise.then((bytes) => {
          onSerialize(cacheId, bytesToBase64(bytes));
        });
      }
    },
  };
};

type ElementCache = ReturnType<typeof createElementCache>;

const getSlotCacheId = (slotId: SlotId): CacheId => `slot/${slotId}`;
const getPathSpecCacheId = (pathSpec: PathSpec): CacheId =>
  `pathSpec/${pathSpecKey(pathSpec)}`; // For routeElement

const assertNonReservedSlotId = (slotId: SlotId) => {
  if (
    slotId === ROOT_SLOT_ID ||
    slotId.startsWith(ROUTE_SLOT_ID_PREFIX) ||
    slotId.startsWith(SLICE_SLOT_ID_PREFIX) ||
    // Capitalized ids are reserved for define-router such as ROUTE_ID, IS_STATIC_ID, HAS404_ID
    /^[A-Z]/.test(slotId)
  ) {
    throw new Error(
      'Element ID cannot be "root", "route:*", "slice:*", or start with a capital letter',
    );
  }
};

type RendererOption = { routePath: string; query: string | undefined };

type GetEtagFromOption = (
  option: RendererOption,
) => Promise<string | undefined>;
type GetEtagFromParams = (
  params?: Record<string, string | string[]>,
) => Promise<string | undefined>;

const bindEtag = <A,>(
  getEtag: ((arg: A) => Promise<string | undefined>) | undefined,
  arg: A,
): (() => Promise<string | undefined>) | undefined =>
  getEtag && (() => getEtag(arg));

type RouteConfig = {
  type: 'route';
  path: PathSpec;
  isStatic: boolean;
  pathPattern?: PathSpec;
  rootElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
    sourceFile?: string;
  };
  routeElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
  };
  elements: Record<
    SlotId,
    {
      isStatic: boolean;
      renderer: (option: RendererOption) => ReactNode;
      getEtagFromOption?: GetEtagFromOption;
      sourceFile?: string;
    }
  >;
  noSsr?: boolean;
  slices?: string[];
  searchCodec?: Unstable_SearchCodec<any>;
};

type ApiConfig = {
  type: 'api';
  path: PathSpec;
  isStatic: boolean;
  handler: ApiHandler;
  sourceFile?: string;
};

type SliceConfig = {
  type: 'slice';
  id: string;
  pathSpec?: PathSpec;
  isStatic: boolean;
  renderer: (params?: Record<string, string | string[]>) => Promise<ReactNode>;
  getEtagFromParams?: GetEtagFromParams;
  sourceFile?: string;
};

type RuntimeConfig = RouteConfig | ApiConfig | SliceConfig;

type SerializableRouteConfig = Omit<
  RouteConfig,
  'rootElement' | 'routeElement' | 'elements' | 'searchCodec'
> & {
  rootElement: Omit<
    RouteConfig['rootElement'],
    'renderer' | 'getEtagFromOption'
  >;
  routeElement: Omit<
    RouteConfig['routeElement'],
    'renderer' | 'getEtagFromOption'
  >;
  elements: Record<
    SlotId,
    Omit<RouteConfig['elements'][string], 'renderer' | 'getEtagFromOption'>
  >;
};

type SerializableApiConfig = Omit<ApiConfig, 'handler'>;

type SerializableSliceConfig = Omit<
  SliceConfig,
  'renderer' | 'getEtagFromParams'
>;

type SerializableConfig =
  SerializableRouteConfig | SerializableApiConfig | SerializableSliceConfig;

const toSerializable = (c: RuntimeConfig): SerializableConfig => {
  if (c.type === 'route') {
    const {
      rootElement,
      routeElement,
      elements,
      searchCodec: _searchCodec,
      ...rest
    } = c;
    const {
      renderer: _rootRenderer,
      getEtagFromOption: _rootGetEtag,
      ...rootElementRest
    } = rootElement;
    const {
      renderer: _routeRenderer,
      getEtagFromOption: _routeGetEtag,
      ...routeElementRest
    } = routeElement;
    return {
      ...rest,
      rootElement: rootElementRest,
      routeElement: routeElementRest,
      elements: Object.fromEntries(
        Object.entries(elements).map(
          ([id, { renderer: _r, getEtagFromOption: _g, ...elRest }]) => [
            id,
            elRest,
          ],
        ),
      ),
    };
  }
  if (c.type === 'api') {
    const { handler: _handler, ...rest } = c;
    return rest;
  }
  const { renderer: _r, getEtagFromParams: _g, ...rest } = c;
  return rest;
};

const pathSpecKey = (p: PathSpec) => JSON.stringify(p);

const noRuntimeFn = (what: string): never => {
  throw new Error(
    `defineRouter: no runtime function found for ${what}; rebuild required`,
  );
};

// `rootElement.renderer` and per-id element renderers are shared
// across routes - any one is a valid fallback for another.
const mergeWithRuntimeConfigs = (
  serializableConfigs: SerializableConfig[],
  runtimeConfigs: RuntimeConfig[],
): RuntimeConfig[] => {
  const runtimeRouteByPath = new Map<string, RouteConfig>();
  const runtimeApiByPath = new Map<string, ApiConfig>();
  const runtimeSliceById = new Map<string, SliceConfig>();
  for (const c of runtimeConfigs) {
    if (c.type === 'route') {
      runtimeRouteByPath.set(pathSpecKey(c.path), c);
    } else if (c.type === 'api') {
      runtimeApiByPath.set(pathSpecKey(c.path), c);
    } else {
      runtimeSliceById.set(c.id, c);
    }
  }
  const sharedRootRenderer = runtimeConfigs.find(
    (c): c is RouteConfig => c.type === 'route',
  )?.rootElement.renderer;
  const sharedElementRenderers = new Map<
    SlotId,
    RouteConfig['elements'][string]['renderer']
  >();
  for (const c of runtimeConfigs) {
    if (c.type !== 'route') {
      continue;
    }
    for (const [id, el] of Object.entries(c.elements)) {
      if (!sharedElementRenderers.has(id)) {
        sharedElementRenderers.set(id, el.renderer);
      }
    }
  }
  return serializableConfigs.map((c) => {
    if (c.type === 'route') {
      const runtimeItem = runtimeRouteByPath.get(pathSpecKey(c.path));
      const label = `route ${pathSpecAsString(c.path)}`;
      const elements: RouteConfig['elements'] = {};
      for (const [id, val] of Object.entries(c.elements)) {
        const elementSpec = runtimeItem?.elements[id];
        elements[id] = {
          isStatic: val.isStatic,
          renderer:
            elementSpec?.renderer ??
            sharedElementRenderers.get(id) ??
            (() => noRuntimeFn(`element "${id}" of ${label}`)),
          ...(elementSpec?.getEtagFromOption
            ? { getEtagFromOption: elementSpec.getEtagFromOption }
            : {}),
          ...(val.sourceFile ? { sourceFile: val.sourceFile } : {}),
        };
      }
      return {
        type: 'route',
        path: c.path,
        isStatic: c.isStatic,
        ...(c.pathPattern !== undefined ? { pathPattern: c.pathPattern } : {}),
        rootElement: {
          isStatic: c.rootElement.isStatic,
          renderer:
            runtimeItem?.rootElement.renderer ??
            sharedRootRenderer ??
            (() => noRuntimeFn(`rootElement of ${label}`)),
          ...(runtimeItem?.rootElement.getEtagFromOption
            ? { getEtagFromOption: runtimeItem.rootElement.getEtagFromOption }
            : {}),
          ...(c.rootElement.sourceFile
            ? { sourceFile: c.rootElement.sourceFile }
            : {}),
        },
        routeElement: {
          isStatic: c.routeElement.isStatic,
          renderer:
            runtimeItem?.routeElement.renderer ??
            (() => noRuntimeFn(`routeElement of ${label}`)),
          ...(runtimeItem?.routeElement.getEtagFromOption
            ? { getEtagFromOption: runtimeItem.routeElement.getEtagFromOption }
            : {}),
        },
        elements,
        ...(c.noSsr !== undefined ? { noSsr: c.noSsr } : {}),
        ...(c.slices !== undefined ? { slices: c.slices } : {}),
        ...(runtimeItem?.searchCodec !== undefined
          ? { searchCodec: runtimeItem.searchCodec }
          : {}),
      };
    }
    if (c.type === 'api') {
      const runtimeItem = runtimeApiByPath.get(pathSpecKey(c.path));
      return {
        type: 'api',
        path: c.path,
        isStatic: c.isStatic,
        handler:
          runtimeItem?.handler ??
          (async () => noRuntimeFn(`api ${pathSpecAsString(c.path)}`)),
        ...(c.sourceFile ? { sourceFile: c.sourceFile } : {}),
      };
    }
    const runtimeItem = runtimeSliceById.get(c.id);
    return {
      type: 'slice',
      id: c.id,
      ...(c.pathSpec !== undefined ? { pathSpec: c.pathSpec } : {}),
      isStatic: c.isStatic,
      renderer:
        runtimeItem?.renderer ?? (async () => noRuntimeFn(`slice ${c.id}`)),
      ...(runtimeItem?.getEtagFromParams
        ? { getEtagFromParams: runtimeItem.getEtagFromParams }
        : {}),
      ...(c.sourceFile ? { sourceFile: c.sourceFile } : {}),
    };
  });
};

const getRouterPrefetchCode = (path2moduleIds: Record<string, string[]>) => {
  const moduleIdSet = new Set<string>();
  Object.values(path2moduleIds).forEach((ids) =>
    ids.forEach((id) => moduleIdSet.add(id)),
  );
  const ids = Array.from(moduleIdSet);
  const path2idxs: Record<string, number[]> = {};
  Object.entries(path2moduleIds).forEach(([path, pathIds]) => {
    path2idxs[path] = pathIds.map((id) => ids.indexOf(id));
  });
  return `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, callback) => {
  const ids = ${JSON.stringify(ids)};
  const path2idxs = ${JSON.stringify(path2idxs)};
  const key = Object.keys(path2idxs).find((key) => new RegExp(key).test(path));
  for (const idx of path2idxs[key] || []) {
    callback(ids[idx]);
  }
};
`;
};

const buildRoutePath2searchCodecId = (
  configs: readonly RuntimeConfig[],
): Record<string, string> => {
  const routePath2searchCodecId: Record<string, string> = {};
  for (const item of configs) {
    if (item.type === 'route' && item.searchCodec !== undefined) {
      routePath2searchCodecId[pathSpecAsString(item.pathPattern ?? item.path)] =
        item.searchCodec.id;
    }
  }
  return routePath2searchCodecId;
};

// Sets the `route -> search codec id` map on the server's globalThis AND returns
// the browser script that sets it client-side. The server copy is needed because
// a cross-route <Link> serializes its href during SSR, where the injected
// browser script has not run yet.
//
// NOTE: this assumes the `rsc` and `ssr` environments share one process global
// (true for the default single-process runtime). An adapter that runs them in
// separate isolates would not see this server copy during SSR.
const setupRouterSearchCodecs = (configs: readonly RuntimeConfig[]) => {
  const routePath2searchCodecId = buildRoutePath2searchCodecId(configs);
  if (Object.keys(routePath2searchCodecId).length === 0) {
    return '';
  }
  (
    globalThis as { __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string> }
  ).__WAKU_ROUTER_SEARCH_CODECS__ = routePath2searchCodecId;
  // escape `<` so the value cannot break out of the inline <script>
  const json = JSON.stringify(routePath2searchCodecId).replace(/</g, '\\u003c');
  return `
globalThis.__WAKU_ROUTER_SEARCH_CODECS__ = ${json};
`;
};

export function unstable_defineRouter(fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) {
  const runHandled = <T,>(req: Request, fn: () => Promise<T>): Promise<T> =>
    routerStorage.run(
      { req, resolveSearchCodec },
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      ),
    );

  let cachedConfigs: RuntimeConfig[] | undefined;
  let cachedHas404 = false;

  const initConfigs = async (
    loadBuildMetadata?: (key: string) => Promise<string | undefined>,
  ) => {
    if (cachedConfigs) {
      return;
    }
    const runtimeConfigs = Array.from(await fns.getConfigs());
    let configs: RuntimeConfig[] = runtimeConfigs;
    if (loadBuildMetadata) {
      const raw = await loadBuildMetadata('defineRouter:serializableConfigs');
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

  const getCachedConfigs = () => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedConfigs;
  };

  let cachedRoutePath2searchCodec:
    Map<string, Unstable_SearchCodec<any>> | undefined;
  const resolveSearchCodec = (
    routePath: string,
  ): Unstable_SearchCodec<any> | undefined => {
    if (!cachedRoutePath2searchCodec) {
      cachedRoutePath2searchCodec = new Map();
      for (const item of getCachedConfigs()) {
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

  const has404 = (): boolean => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedHas404;
  };

  const getPathConfigItem = (pathname: string) => {
    const routePath = pathnameToRoutePath(pathname);
    return getCachedConfigs().find(
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
    for (const item of getCachedConfigs()) {
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
    const pathConfigItem = getPathConfigItem(routePath);
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
      const found = findSliceConfig(sliceId);
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
    if (has404()) {
      elements[HAS404_ID] = true;
    }
    return { elements, etags };
  };

  type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedPath2moduleIds: Record<string, string[]> | undefined;

  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, renderHtml, loadBuildMetadata },
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    await initConfigs(loadBuildMetadata);
    return runHandled(input.req, async () => {
      requestElementCacheInit ??= (async () => {
        const cachedElementsMetadata = await loadBuildMetadata(
          'defineRouter:cachedElements',
        );
        if (cachedElementsMetadata) {
          Object.entries(JSON.parse(cachedElementsMetadata)).forEach(
            ([cacheId, str]) => {
              requestElementCache.preload(
                cacheId,
                base64ToBytes(str as string),
              );
            },
          );
        }
      })();
      await requestElementCacheInit;
      const getPath2moduleIds = async () => {
        if (!cachedPath2moduleIds) {
          cachedPath2moduleIds = JSON.parse(
            (await loadBuildMetadata('defineRouter:path2moduleIds')) || '{}',
          );
        }
        return cachedPath2moduleIds!;
      };

      const clientEtags = input.etags ?? {};
      const withRerender = async <T,>(fn: () => Promise<T>) => {
        let entriesPromise: Promise<RouteEntries> = Promise.resolve({
          elements: {},
          etags: {},
        });
        let rendered = false;
        const rerender = (rscPath: string, rscParams?: unknown) => {
          if (rendered) {
            throw new Error('already rendered');
          }
          entriesPromise = Promise.all([
            entriesPromise,
            getEntriesForRoute(
              rscPath,
              rscParams,
              clientEtags,
              requestElementCache,
            ),
          ]).then(([oldEntries, newEntries]) => {
            if (newEntries === null) {
              console.warn('getEntries returned null');
              return oldEntries;
            }
            return {
              elements: { ...oldEntries.elements, ...newEntries.elements },
              etags: { ...oldEntries.etags, ...newEntries.etags },
            };
          });
        };
        setRerender(rerender);
        try {
          const value = await fn();
          return { value, entries: await entriesPromise };
        } finally {
          rendered = true;
        }
      };

      if (input.type === 'rsc') {
        const sliceId = decodeSliceId(input.rscPath);
        if (sliceId !== null) {
          // LIMITATION: This is a single slice request.
          // Ideally, we should be able to respond with multiple slices in one request.
          // The skip header is not consulted here; the etag skip only covers
          // route-bundled slices. The etag is still sent to keep the client's
          // tag fresh.
          const found = findSliceConfig(sliceId);
          if (!found) {
            return null;
          }
          const { sliceConfig, params: sliceParams } = found;
          const sliceSlotId = SLICE_SLOT_ID_PREFIX + sliceId;
          const { elements, etags } = await buildElements(
            {},
            {
              [sliceSlotId]: {
                immutable: sliceConfig.isStatic,
                getEtag: bindEtag(sliceConfig.getEtagFromParams, sliceParams),
                render: () =>
                  getSliceElement(
                    sliceConfig,
                    requestElementCache,
                    sliceId,
                    sliceParams,
                  ),
              },
            },
          );
          return renderRsc(elements, { etags });
        }
        const entries = await getEntriesForRoute(
          input.rscPath,
          input.rscParams,
          clientEtags,
          requestElementCache,
        );
        if (!entries) {
          return null;
        }
        return renderRsc(entries.elements, { etags: entries.etags });
      }

      if (input.type === 'call') {
        try {
          const { value, entries } = await withRerender(() =>
            input.fn(...input.args),
          );
          return renderRsc(entries.elements, { value, etags: entries.etags });
        } catch (e) {
          const info = getErrorInfo(e);
          if (info?.location) {
            const routePath = pathnameToRoutePath(info.location);
            const rscPath = encodeRoutePath(routePath);
            const entries = await getEntriesForRoute(
              rscPath,
              undefined,
              clientEtags,
              requestElementCache,
            );
            if (!entries) {
              unstable_notFound();
            }
            return renderRsc(entries.elements, { etags: entries.etags });
          }
          throw e;
        }
      }

      if (input.type === 'http') {
        const pathConfigItem = getPathConfigItem(input.pathname);
        if (pathConfigItem?.type === 'api') {
          const url = new URL(input.req.url);
          url.pathname = input.pathname;
          const req = new Request(url, input.req);
          const params =
            getPathMapping(pathConfigItem.path, input.pathname) ?? {};
          return pathConfigItem.handler(req, { params });
        }
        const renderIt = async (
          pathname: string,
          query: string,
          status = 200,
        ) => {
          const routePath = pathnameToRoutePath(pathname);
          const rscPath = encodeRoutePath(routePath);
          const rscParams = new URLSearchParams({ query });
          let entries = await getEntriesForRoute(
            rscPath,
            rscParams,
            clientEtags,
            requestElementCache,
          );
          if (!entries) {
            return null;
          }
          const path2moduleIds = await getPath2moduleIds();
          const route = { path: routePath, query, hash: '' };
          const nonce = getNonce();
          const html = <INTERNAL_ServerRouter route={route} />;
          let formState: unknown;
          if (input.tryAction) {
            const { value, entries: rerendered } = await withRerender(
              input.tryAction,
            );
            formState = value.action ? value.formState : undefined;
            entries = {
              elements: { ...entries.elements, ...rerendered.elements },
              etags: { ...entries.etags, ...rerendered.etags },
            };
          }
          return renderHtml(
            await renderRsc(entries.elements, { etags: entries.etags }),
            html,
            {
              rscPath,
              formState,
              status,
              ...(nonce ? { nonce } : {}),
              unstable_extraScriptContent:
                getRouterPrefetchCode(path2moduleIds) +
                setupRouterSearchCodecs(getCachedConfigs()),
            },
          );
        };
        const url = new URL(input.req.url);
        const query = url.searchParams.toString();
        if (pathConfigItem?.noSsr) {
          return 'fallback';
        }
        try {
          if (pathConfigItem) {
            return await renderIt(input.pathname, query);
          }
        } catch (e) {
          const info = getErrorInfo(e);
          if (info?.status !== 404) {
            throw e;
          }
        }
        if (has404()) {
          return renderIt('/404', '', 404);
        } else {
          return null;
        }
      }
    });
  };

  const handleBuild: HandleBuild = async ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    saveBuildMetadata,
    generateFile,
    generateDefaultHtml,
    unstable_registerPrunableFile,
  }) => {
    await initConfigs();
    const configs = getCachedConfigs();
    const allSourceFiles = new Set<string>();
    const dynamicSourceFiles = new Set<string>();
    const recordSourceFile = (
      isStatic: boolean,
      sourceFile: string | undefined,
    ) => {
      if (!sourceFile) {
        return;
      }
      allSourceFiles.add(sourceFile);
      if (!isStatic) {
        dynamicSourceFiles.add(sourceFile);
      }
    };
    for (const c of configs) {
      if (c.type === 'route') {
        recordSourceFile(c.rootElement.isStatic, c.rootElement.sourceFile);
        for (const el of Object.values(c.elements)) {
          recordSourceFile(el.isStatic, el.sourceFile);
        }
      } else {
        recordSourceFile(c.isStatic, c.sourceFile);
      }
    }
    for (const srcPath of allSourceFiles) {
      if (!dynamicSourceFiles.has(srcPath)) {
        unstable_registerPrunableFile(srcPath);
      }
    }
    const serializedCachedElements = new Map<CacheId, string>();
    const buildElementCache = createElementCache((cacheId, serialized) => {
      serializedCachedElements.set(cacheId, serialized);
    });

    // hard-coded concurrency limit
    const { runTask, waitForTasks } = createTaskRunner(500);
    const skipBuild = fns.unstable_skipBuild;

    // static api
    for (const item of configs) {
      if (item.type !== 'api') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      const routePath = pathSpecToRoutePath(item.path);
      if (!routePath) {
        continue;
      }
      if (skipBuild?.(routePath)) {
        continue;
      }
      const req = new Request(new URL(routePath, 'http://localhost:3000'));
      runTask(async () => {
        await runHandled(req, async () => {
          const res = await item.handler(req, { params: {} });
          await generateFile(routePath, res.body || '').catch((e) => {
            if (e instanceof Error && 'code' in e && e.code === 'EEXIST') {
              throw new Error(
                `the API route ${pathSpecAsString(item.path)} faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".`,
                { cause: e },
              );
            }

            throw e;
          });
        });
      });
    }

    const path2moduleIds: Record<string, string[]> = {};
    const htmlRenderTasks = new Set<() => Promise<void>>();

    const cacheStaticElementsOfRoute = async (
      item: RouteConfig,
      routePath: string | undefined,
    ) => {
      const option: RendererOption = {
        routePath: routePath ?? pathSpecAsString(item.path),
        query: undefined,
      };
      const tasks: Promise<unknown>[] = [];
      const cache = (
        cacheId: CacheId,
        el: { isStatic: boolean; renderer: (o: RendererOption) => ReactNode },
      ) => {
        if (!el.isStatic || buildElementCache.get(cacheId)) {
          return;
        }
        const result = buildElementCache.set(cacheId, el.renderer(option));
        if (result instanceof Promise) {
          tasks.push(result);
        }
      };
      cache(getSlotCacheId(ROOT_SLOT_ID), item.rootElement);
      cache(getPathSpecCacheId(item.path), item.routeElement);
      for (const [id, el] of Object.entries(item.elements)) {
        cache(getSlotCacheId(id), el);
      }
      await Promise.all(tasks);
    };

    // for each route, cache static elements and generate files for full static route
    for (const item of configs) {
      if (item.type !== 'route') {
        continue;
      }
      const routePath = pathSpecToRoutePath(item.path);
      if (routePath && skipBuild?.(routePath)) {
        continue;
      }
      if (!routePath || !item.isStatic) {
        const req = new Request(
          new URL(
            routePath ?? pathSpecAsString(item.path),
            'http://localhost:3000',
          ),
        );
        runTask(() =>
          runHandled(req, () => cacheStaticElementsOfRoute(item, routePath)),
        );
        continue;
      }
      const rscPath = encodeRoutePath(routePath);
      const req = new Request(new URL(routePath, 'http://localhost:3000'));
      runTask(async () => {
        await runHandled(req, async () => {
          const entries = await getEntriesForRoute(
            rscPath,
            undefined,
            {},
            buildElementCache,
          );
          if (!entries) {
            return;
          }
          for (const id of Object.keys(entries.elements)) {
            const cached = buildElementCache.get(id);
            entries.elements[id] = cached ? await cached : entries.elements[id];
          }
          const moduleIds = new Set<string>();
          const stream = await renderRsc(entries.elements, {
            etags: entries.etags,
            unstable_clientModuleCallback: (ids) =>
              ids.forEach((id) => moduleIds.add(id)),
          });
          const [stream1, stream2] = stream.tee();
          await generateFile(rscPath2pathname(rscPath), stream1);
          path2moduleIds[path2regexp(item.pathPattern || item.path)] =
            Array.from(moduleIds);
          htmlRenderTasks.add(() =>
            // Run inside the same request/router/interceptor scope as the RSC
            // render, so the deferred HTML render is consistent with it.
            runHandled(req, async () => {
              const html = (
                <INTERNAL_ServerRouter
                  route={{ path: routePath, query: '', hash: '' }}
                />
              );
              const res = await renderHtml(stream2, html, {
                rscPath,
                unstable_extraScriptContent:
                  getRouterPrefetchCode(path2moduleIds) +
                  setupRouterSearchCodecs(configs),
              });
              await generateFile(
                routePathToHtmlFilePath(routePath),
                res.body || '',
              );
            }),
          );
        });
      });
    }
    // HACK hopefully there is a better way than this
    await waitForTasks();
    htmlRenderTasks.forEach(runTask);

    // default html
    for (const item of configs) {
      if (item.type !== 'route') {
        continue;
      }
      if (item.noSsr) {
        const routePath = pathSpecToRoutePath(item.path);
        if (!routePath) {
          throw new Error('Pathname is required for noSsr routes on build');
        }
        if (skipBuild?.(routePath)) {
          continue;
        }
        runTask(async () => {
          await generateDefaultHtml(routePathToHtmlFilePath(routePath));
        });
      }
    }

    // static slice
    for (const item of configs) {
      if (item.type !== 'slice') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      if (item.pathSpec) {
        // Skip slug slices — we can't pre-build them
        continue;
      }
      const rscPath = encodeSliceId(item.id);
      // dummy req for slice which is not determined at build time
      const req = new Request(new URL('http://localhost:3000'));
      runTask(async () => {
        await runHandled(req, async () => {
          const sliceSlotId = SLICE_SLOT_ID_PREFIX + item.id;
          const { elements, etags } = await buildElements(
            {},
            {
              [sliceSlotId]: {
                immutable: true,
                render: () => getSliceElement(item, buildElementCache),
              },
            },
          );
          const body = await renderRsc(elements, { etags });
          await generateFile(rscPath2pathname(rscPath), body);
        });
      });
    }

    await waitForTasks();

    // TODO should we save serialized cached elements separately?
    await saveBuildMetadata(
      'defineRouter:cachedElements',
      JSON.stringify(Object.fromEntries(serializedCachedElements)),
    );
    await saveBuildMetadata(
      'defineRouter:path2moduleIds',
      JSON.stringify(path2moduleIds),
    );
    await saveBuildMetadata(
      'defineRouter:serializableConfigs',
      JSON.stringify(configs.map(toSerializable)),
    );
  };

  return Object.assign(defineHandlers({ handleRequest, handleBuild }), {
    unstable_getRouterConfigs: async () => getCachedConfigs(),
  });
}
