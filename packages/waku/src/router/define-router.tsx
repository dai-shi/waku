import type { ReactNode } from 'react';
import {
  unstable_createCustomError as createCustomError,
  unstable_defineHandlers as defineHandlers,
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
  HandlerInterceptor,
  RendererOption,
  RouteConfig,
  RuntimeConfig,
} from './define-router-utils/config-types.js';
import {
  ROOT_SLOT_ID,
  createElementCache,
  getPathSpecCacheId,
  getSlotCacheId,
} from './define-router-utils/element-cache.js';
import type { CacheId } from './define-router-utils/element-cache.js';
import { path2regexp } from './define-router-utils/path-spec.js';
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
import { createTaskRunner } from './define-router-utils/task-runner.js';
import { buildRouteHref } from './isomorphic-utils/build-route-href.js';
import type {
  BuildRouteHrefTarget,
  RouteHref,
  RoutePath,
} from './isomorphic-utils/build-route-href.js';
import { pathSpecAsString } from './isomorphic-utils/path-spec.js';
import type { PathSpec } from './isomorphic-utils/path-spec.js';
import {
  encodeRoutePath,
  encodeSliceId,
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

  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const handleRequest = createRequestHandler({
    configRegistry,
    routeEntries,
    runHandled,
  });

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
          const entries = await routeEntries.getEntriesForRoute(
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
          const entries = await routeEntries.getEntriesForSlice(
            item.id,
            buildElementCache,
            { sliceConfig: item },
          );
          if (!entries) {
            return;
          }
          const body = await renderRsc(entries.elements, {
            etags: entries.etags,
          });
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
