import type { ReactNode } from 'react';
import {
  unstable_base64ToBytes as base64ToBytes,
  unstable_buildElements as buildElements,
  unstable_createCustomError as createCustomError,
  unstable_defineHandlers as defineHandlers,
  unstable_getErrorInfo as getErrorInfo,
} from '../minimal/server.js';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from '../minimal/server.js';
import { INTERNAL_ServerRouter } from './client.js';
import { DEFINE_ROUTER_METADATA } from './define-router-utils/build-metadata.js';
import {
  getRouterPrefetchCode,
  setupRouterSearchCodecs,
} from './define-router-utils/client-code.js';
import { createConfigRegistry } from './define-router-utils/config-registry.js';
import { toSerializable } from './define-router-utils/config-serialization.js';
import type {
  ApiHandler,
  GetEtagFromParams,
  HandlerInterceptor,
  RendererOption,
  RouteConfig,
  RuntimeConfig,
  SlotId,
} from './define-router-utils/config-types.js';
import {
  ROOT_SLOT_ID,
  ROUTE_SLOT_ID_PREFIX,
  SLICE_SLOT_ID_PREFIX,
  createElementCache,
  getPathSpecCacheId,
  getSlotCacheId,
} from './define-router-utils/element-cache.js';
import type {
  CacheId,
  ElementCache,
} from './define-router-utils/element-cache.js';
import { path2regexp } from './define-router-utils/path-spec.js';
import {
  getHeaders,
  getNonce,
  getRequest,
  getRerender,
  getResolveSearchCodec,
  getRscParams,
  getRscPath,
  runWithRouterStore,
  setNonce,
  setRerender,
  setRscParams,
  setRscPath,
} from './define-router-utils/request-store.js';
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

export {
  getRequest as unstable_getRequest,
  getHeaders as unstable_getHeaders,
  getRscPath as unstable_getRscPath,
  getRscParams as unstable_getRscParams,
  setNonce as unstable_setNonce,
};
export type { ApiHandler, HandlerInterceptor };

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

type RouteEntries = {
  elements: Record<string, unknown>;
  etags: Etags;
};

const bindEtag = <A,>(
  getEtag: ((arg: A) => Promise<string | undefined>) | undefined,
  arg: A,
): (() => Promise<string | undefined>) | undefined =>
  getEtag && (() => getEtag(arg));

export function unstable_defineRouter(fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) {
  const configRegistry = createConfigRegistry(fns.getConfigs);

  const runHandled = <T,>(req: Request, fn: () => Promise<T>): Promise<T> =>
    runWithRouterStore(
      { req, resolveSearchCodec: configRegistry.resolveSearchCodec },
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      ),
    );

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

  type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedPath2moduleIds: Record<string, string[]> | undefined;

  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, renderHtml, loadBuildMetadata },
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    await configRegistry.initialize(loadBuildMetadata);
    return runHandled(input.req, async () => {
      requestElementCacheInit ??= (async () => {
        const cachedElementsMetadata = await loadBuildMetadata(
          DEFINE_ROUTER_METADATA.cachedElements,
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
            (await loadBuildMetadata(DEFINE_ROUTER_METADATA.path2moduleIds)) ||
              '{}',
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
          const found = configRegistry.findSliceConfig(sliceId);
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
        const pathConfigItem = configRegistry.findPathConfig(input.pathname);
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
                setupRouterSearchCodecs(configRegistry.getAll()),
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
        if (configRegistry.has404()) {
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
    await configRegistry.initialize();
    const configs = configRegistry.getAll();
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
      DEFINE_ROUTER_METADATA.cachedElements,
      JSON.stringify(Object.fromEntries(serializedCachedElements)),
    );
    await saveBuildMetadata(
      DEFINE_ROUTER_METADATA.path2moduleIds,
      JSON.stringify(path2moduleIds),
    );
    await saveBuildMetadata(
      DEFINE_ROUTER_METADATA.serializableConfigs,
      JSON.stringify(configs.map(toSerializable)),
    );
  };

  return Object.assign(defineHandlers({ handleRequest, handleBuild }), {
    unstable_getRouterConfigs: async () => configRegistry.getAll(),
  });
}
