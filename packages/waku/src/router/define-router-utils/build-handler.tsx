import type { ReactNode } from 'react';
import type { unstable_defineHandlers as defineHandlers } from '../../minimal/server.js';
import { INTERNAL_ServerRouter } from '../client.js';
import { pathSpecAsString } from '../isomorphic-utils/path-spec.js';
import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import {
  encodeRoutePath,
  encodeSliceId,
} from '../isomorphic-utils/route-path.js';
import { DEFINE_ROUTER_METADATA } from './build-metadata.js';
import {
  getRouterPrefetchCode,
  setupRouterSearchCodecs,
} from './client-code.js';
import type { ConfigRegistry } from './config-registry.js';
import { toSerializable } from './config-serialization.js';
import type { RendererOption, RouteConfig } from './config-types.js';
import {
  ROOT_SLOT_ID,
  createElementCache,
  getPathSpecCacheId,
  getSlotCacheId,
} from './element-cache.js';
import type { CacheId } from './element-cache.js';
import { path2regexp } from './path-spec.js';
import type { createRouteEntries } from './route-entries.js';
import { createTaskRunner } from './task-runner.js';

type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

const pathSpecToRoutePath = (pathSpec: PathSpec) => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    return undefined;
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

const routePathToHtmlFilePath = (routePath: string): string =>
  routePath === '/404' ? '404.html' : routePath + '/index.html';

export const createBuildHandler = ({
  configRegistry,
  routeEntries,
  runHandled,
  skipBuild,
}: {
  configRegistry: ConfigRegistry;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(req: Request, fn: () => Promise<T>) => Promise<T>;
  skipBuild: ((routePath: string) => boolean) | undefined;
}): HandleBuild => {
  return async ({
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

    const serializedCachedElements = new Map<CacheId, string>();
    const buildElementCache = createElementCache((cacheId, serialized) => {
      serializedCachedElements.set(cacheId, serialized);
    });
    const { runTask, waitForTasks } = createTaskRunner(500);
    const path2moduleIds: Record<string, string[]> = {};
    const htmlRenderTasks = new Set<() => Promise<void>>();

    const registerPrunableSourceFiles = () => {
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
    };

    const generateStaticApiResponses = () => {
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
    };

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

    const buildRoutes = () => {
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
              entries.elements[id] = cached
                ? await cached
                : entries.elements[id];
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
    };

    const generateNoSsrDefaultHtml = () => {
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
    };

    const buildStaticSlices = () => {
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
    };

    const persistBuildMetadata = async () => {
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

    registerPrunableSourceFiles();
    generateStaticApiResponses();
    buildRoutes();
    // HACK hopefully there is a better way than this
    await waitForTasks();
    htmlRenderTasks.forEach(runTask);
    generateNoSsrDefaultHtml();
    buildStaticSlices();
    await waitForTasks();
    await persistBuildMetadata();
  };
};
