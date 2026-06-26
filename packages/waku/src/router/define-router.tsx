import type { ReactNode } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { base64ToBytes, bytesToBase64 } from '../lib/utils/base64-web.js';
import { createCustomError, getErrorInfo } from '../lib/utils/custom-errors.js';
import {
  getPathMapping,
  path2regexp,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { createTaskRunner } from '../lib/utils/task-runner.js';
import { unstable_defineHandlers as defineHandlers } from '../minimal/server.js';
import { deserializeRsc, serializeRsc } from '../server.js';
import { INTERNAL_ServerRouter } from './client.js';
import {
  ETAG_ID_PREFIX,
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  SKIP_HEADER,
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  encodeSliceId,
  pathnameToRoutePath,
} from './common-utils/route-path.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

const isStringRecord = (x: unknown): x is Record<string, string> =>
  typeof x === 'object' &&
  x !== null &&
  !Array.isArray(x) &&
  Object.values(x).every((v) => typeof v === 'string');

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
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

export type HandlerInterceptor = <T>(next: () => Promise<T>) => Promise<T>;

type Rerender = (rscPath: string, rscParams?: unknown) => void;

type RouterStore = {
  req: Request;
  rscPath?: string;
  rscParams?: unknown;
  rerender?: Rerender;
  nonce?: string;
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
 * Redirect to a path in the current application.
 * The `location` must start with a single `/`.
 */
export function unstable_redirect(
  location: string,
  status: 303 | 307 | 308 = 307,
): never {
  if (!location.startsWith('/') || location.startsWith('//')) {
    throw new Error('Invalid redirect location');
  }
  for (let i = 0; i < location.length; ++i) {
    const charCode = location.charCodeAt(i);
    if (charCode < 0x20 || charCode === 0x7f || charCode === 0x5c) {
      throw new Error('Invalid redirect location');
    }
  }
  throw createCustomError('Redirect', { status, location });
}

type SlotId = string;

const ROOT_SLOT_ID = 'root';
const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

// The element tag (etag) used for every static slot; known without rendering.
const STATIC_ETAG = 'static';

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
  searchCodecId?: string;
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
  'rootElement' | 'routeElement' | 'elements'
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
  | SerializableRouteConfig
  | SerializableApiConfig
  | SerializableSliceConfig;

const toSerializable = (c: RuntimeConfig): SerializableConfig => {
  if (c.type === 'route') {
    const { rootElement, routeElement, elements, ...rest } = c;
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
        ...(c.searchCodecId !== undefined
          ? { searchCodecId: c.searchCodecId }
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
    if (item.type === 'route' && item.searchCodecId !== undefined) {
      routePath2searchCodecId[pathSpecAsString(item.pathPattern ?? item.path)] =
        item.searchCodecId;
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
      { req },
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
    headers: Readonly<Record<string, string>>,
    elementCache: ElementCache,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const routePath = decodeRoutePath(rscPath);
    const pathConfigItem = getPathConfigItem(routePath);
    if (pathConfigItem?.type !== 'route') {
      return null;
    }
    const parsedEtags = safeJsonParse(
      headers[SKIP_HEADER.toLowerCase()] || '{}',
    );
    const clientEtags: Record<string, string> = isStringRecord(parsedEtags)
      ? parsedEtags
      : {};
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
    const entries: Record<SlotId, unknown> = {};
    const addEntry = async (
      slotId: SlotId,
      isStatic: boolean,
      cacheId: CacheId,
      render: () => ReactNode | Promise<ReactNode>,
      getEtag: () => Promise<string | undefined> | undefined,
    ) => {
      if (isStatic) {
        if (clientEtags[slotId] === STATIC_ETAG) {
          return;
        }
        if (!elementCache.get(cacheId)) {
          await elementCache.set(cacheId, await render());
        }
        entries[slotId] = await elementCache.get(cacheId);
        entries[ETAG_ID_PREFIX + slotId] = STATIC_ETAG;
      } else {
        const etag = await getEtag();
        if (etag !== undefined && etag === clientEtags[slotId]) {
          return;
        }
        entries[slotId] = await render();
        if (etag !== undefined) {
          entries[ETAG_ID_PREFIX + slotId] = etag;
        } else if (clientEtags[slotId] !== undefined) {
          // The slot no longer has a tag but the client still holds one; send
          // an empty tag to clear it (the client drops empty tags).
          entries[ETAG_ID_PREFIX + slotId] = '';
        }
      }
    };
    await Promise.all([
      addEntry(
        ROOT_SLOT_ID,
        pathConfigItem.rootElement.isStatic,
        getSlotCacheId(ROOT_SLOT_ID),
        () => pathConfigItem.rootElement.renderer(option),
        () => pathConfigItem.rootElement.getEtagFromOption?.(option),
      ),
      addEntry(
        routeId,
        pathConfigItem.routeElement.isStatic,
        routeTemplateCacheId,
        () => pathConfigItem.routeElement.renderer(option),
        () => pathConfigItem.routeElement.getEtagFromOption?.(option),
      ),
      ...Object.entries(pathConfigItem.elements).map(([id, el]) =>
        addEntry(
          id,
          el.isStatic,
          getSlotCacheId(id),
          () => el.renderer(option),
          () => el.getEtagFromOption?.(option),
        ),
      ),
      ...slices.map((sliceId) => {
        const sliceConfig = sliceConfigMap.get(sliceId);
        if (!sliceConfig) {
          throw new Error(`Slice not found: ${sliceId}`);
        }
        return addEntry(
          SLICE_SLOT_ID_PREFIX + sliceId,
          sliceConfig.isStatic,
          getSlotCacheId(SLICE_SLOT_ID_PREFIX + sliceId),
          () => sliceConfig.renderer(sliceConfig.params),
          () => sliceConfig.getEtagFromParams?.(sliceConfig.params),
        );
      }),
    ]);
    entries[ROUTE_ID] = [routePath, query];
    entries[IS_STATIC_ID] = pathConfigItem.isStatic;
    sliceConfigMap.forEach((sliceConfig, sliceId) => {
      if (sliceConfig.isStatic) {
        // FIXME: hard-coded for now
        entries[IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId] = true;
      }
    });
    if (has404()) {
      entries[HAS404_ID] = true;
    }
    return entries;
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

      const pathConfigItem = getPathConfigItem(input.pathname);
      if (pathConfigItem?.type === 'api') {
        const url = new URL(input.req.url);
        url.pathname = input.pathname;
        const req = new Request(url, input.req);
        const params =
          getPathMapping(pathConfigItem.path, input.pathname) ?? {};
        return pathConfigItem.handler(req, { params });
      }

      const url = new URL(input.req.url);
      const headers = Object.fromEntries(input.req.headers.entries());
      const withRerender = async <T,>(fn: () => Promise<T>) => {
        let elementsPromise: Promise<Record<string, unknown>> = Promise.resolve(
          {},
        );
        let rendered = false;
        const rerender = (rscPath: string, rscParams?: unknown) => {
          if (rendered) {
            throw new Error('already rendered');
          }
          elementsPromise = Promise.all([
            elementsPromise,
            getEntriesForRoute(
              rscPath,
              rscParams,
              headers,
              requestElementCache,
            ),
          ]).then(([oldElements, newElements]) => {
            if (newElements === null) {
              console.warn('getEntries returned null');
            }
            return { ...oldElements, ...newElements };
          });
        };
        setRerender(rerender);
        try {
          const value = await fn();
          return { value, elements: await elementsPromise };
        } finally {
          rendered = true;
        }
      };

      if (input.type === 'component') {
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
          const sliceEtag = sliceConfig.isStatic
            ? STATIC_ETAG
            : await sliceConfig.getEtagFromParams?.(sliceParams);
          const sliceElement = await getSliceElement(
            sliceConfig,
            requestElementCache,
            sliceId,
            sliceParams,
          );
          return renderRsc({
            [SLICE_SLOT_ID_PREFIX + sliceId]: sliceElement,
            ...(sliceConfig.isStatic
              ? {
                  // FIXME: hard-coded for now
                  [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId]: true,
                }
              : {}),
            ...(sliceEtag !== undefined
              ? { [ETAG_ID_PREFIX + SLICE_SLOT_ID_PREFIX + sliceId]: sliceEtag }
              : {}),
          });
        }
        const entries = await getEntriesForRoute(
          input.rscPath,
          input.rscParams,
          headers,
          requestElementCache,
        );
        if (!entries) {
          return null;
        }
        return renderRsc(entries);
      }

      if (input.type === 'function') {
        try {
          const { value, elements } = await withRerender(() =>
            input.fn(...input.args),
          );
          return renderRsc(elements, { value });
        } catch (e) {
          const info = getErrorInfo(e);
          if (info?.location) {
            const routePath = pathnameToRoutePath(info.location);
            const rscPath = encodeRoutePath(routePath);
            const entries = await getEntriesForRoute(
              rscPath,
              undefined,
              headers,
              requestElementCache,
            );
            if (!entries) {
              unstable_notFound();
            }
            return renderRsc(entries);
          }
          throw e;
        }
      }

      if (input.type === 'action' || input.type === 'custom') {
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
            headers,
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
          if (input.type === 'action') {
            const { value, elements } = await withRerender(() => input.fn());
            formState = value;
            entries = { ...entries, ...elements };
          }
          return renderHtml(await renderRsc(entries), html, {
            rscPath,
            formState,
            status,
            ...(nonce ? { nonce } : {}),
            unstable_extraScriptContent:
              getRouterPrefetchCode(path2moduleIds) +
              setupRouterSearchCodecs(getCachedConfigs()),
          });
        };
        const query = url.searchParams.toString();
        if (pathConfigItem?.type === 'route' && pathConfigItem.noSsr) {
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
          for (const id of Object.keys(entries)) {
            const cached = buildElementCache.get(id);
            entries[id] = cached ? await cached : entries[id];
          }
          const moduleIds = new Set<string>();
          const stream = await renderRsc(entries, {
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
          const sliceElement = await getSliceElement(item, buildElementCache);
          const body = await renderRsc({
            [SLICE_SLOT_ID_PREFIX + item.id]: sliceElement,
            // FIXME: hard-coded for now
            [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + item.id]: true,
            [ETAG_ID_PREFIX + SLICE_SLOT_ID_PREFIX + item.id]: STATIC_ETAG,
          });
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
