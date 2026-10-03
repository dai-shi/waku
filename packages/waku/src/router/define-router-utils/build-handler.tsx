import type { Unstable_HandleBuild as HandleBuild } from 'waku/minimal/server';
import { INTERNAL_ServerRouter } from '../client.js';
import {
  encodeRoutePath,
  encodeSliceId,
  getRouteSlotId,
  isSliceSlotId,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import { ROUTER_METADATA } from './build-metadata.js';
import { getRouterPrefetchCode } from './client-code.js';
import {
  cacheElementSource,
  createElementCache,
  getSlotCacheId,
} from './element-cache.js';
import type { Resolve, createRouteEntries } from './route-entries.js';

export const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const tasks: Promise<void>[] = [];
  const scheduleTask = async (task: () => Promise<void>) => {
    while (running >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    try {
      await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  return {
    runTask: (task: () => Promise<void>) => {
      tasks.push(scheduleTask(task));
    },
    waitForTasks: () => Promise.all(tasks),
  };
};

export const createBuildHandler =
  ({
    resolve,
    getBuildPaths,
    getBuildElementIds,
    routeEntries,
    runHandled,
  }: {
    resolve: Resolve;
    getBuildPaths: (() => Promise<Iterable<string>>) | undefined;
    getBuildElementIds: (() => Promise<Iterable<string>>) | undefined;
    routeEntries: ReturnType<typeof createRouteEntries>;
    runHandled: <T>(req: Request, fn: () => Promise<T>) => Promise<T>;
  }): HandleBuild =>
  async (utils) => {
    const cachedElements: Record<string, string> = {};
    const cache = createElementCache((id, bytes) => {
      cachedElements[id] = bytes;
    });
    const path2moduleIds: Record<string, string[]> = {};
    const htmlTasks: (() => Promise<void>)[] = [];
    const { runTask, waitForTasks } = createTaskRunner(500);

    const buildUrls = Array.from(
      (await getBuildPaths?.()) || [],
      (pathname) => {
        if (
          !pathname.startsWith('/') ||
          pathname.startsWith('//') ||
          pathname.includes('?') ||
          pathname.includes('#')
        ) {
          throw new Error('Build path must be a pathname: ' + pathname);
        }
        const url = new URL('http://localhost:3000');
        url.pathname = pathname;
        url.pathname = pathnameToRoutePath(url.pathname);
        return url;
      },
    );
    for (const url of buildUrls) {
      const routePath = url.pathname;
      const req = new Request(url);
      runTask(() =>
        runHandled(req, async () => {
          const resolved = await resolve(routePath, '');
          if (!resolved) {
            throw new Error('Build path did not resolve: ' + routePath);
          }
          if (typeof resolved === 'function') {
            const response = await resolved(req);
            await utils.generateFile(routePath, response.body || '');
            return;
          }
          if (
            !Object.values(resolved.elements).every(
              (source) => source.immutable,
            )
          ) {
            await Promise.all(
              Object.entries(resolved.elements).map(async ([id, source]) => {
                if (source.immutable) {
                  const slotId =
                    id === 'route' ? getRouteSlotId(routePath) : id;
                  await cacheElementSource(
                    source,
                    getSlotCacheId(slotId),
                    cache,
                  ).render();
                }
              }),
            );
            return;
          }
          const rscPath = encodeRoutePath(routePath);
          const entries = await routeEntries.getEntriesForRoute(
            rscPath,
            undefined,
            {},
            cache,
            {
              ...resolved,
              elements: {
                ...resolved.elements,
                route: cacheElementSource(
                  resolved.elements.route,
                  getSlotCacheId(getRouteSlotId(routePath)),
                  cache,
                ),
              },
            },
          );
          if (!entries) {
            return;
          }
          const moduleIds = new Set<string>();
          const stream = await utils.renderRsc(entries.elements, {
            etags: entries.etags,
            unstable_clientModuleCallback: (ids) =>
              ids.forEach((id) => moduleIds.add(id)),
          });
          const htmlPath =
            routePath === '/404' ? '404.html' : routePath + '/index.html';
          if (resolved.noSsr) {
            await utils.generateFile(utils.rscPath2pathname(rscPath), stream);
            await utils.generateDefaultHtml(htmlPath);
          } else {
            const [payload, htmlPayload] = stream.tee();
            await utils.generateFile(utils.rscPath2pathname(rscPath), payload);
            htmlTasks.push(() =>
              runHandled(req, async () => {
                const response = await utils.renderHtml(
                  htmlPayload,
                  <INTERNAL_ServerRouter
                    route={{ path: routePath, query: '', hash: '' }}
                  />,
                  {
                    rscPath,
                    unstable_extraScriptContent:
                      getRouterPrefetchCode(path2moduleIds),
                  },
                );
                await utils.generateFile(htmlPath, response.body || '');
              }),
            );
          }
          path2moduleIds[
            '^' + routePath.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '$'
          ] = [...moduleIds];
        }),
      );
    }
    await waitForTasks();
    for (const id of new Set((await getBuildElementIds?.()) || [])) {
      runTask(async () => {
        if (!isSliceSlotId(id)) {
          throw new Error('Unsupported build element ID: ' + id);
        }
        const rscPath = encodeSliceId(id.slice('slice:'.length));
        const pathname = utils.rscPath2pathname(rscPath);
        const req = new Request(new URL(pathname, 'http://localhost:3000'));
        return runHandled(req, async () => {
          const entries = await routeEntries.getEntriesForElement(id, cache);
          if (!entries) {
            throw new Error('Build element did not resolve: ' + id);
          }
          if (entries.etags[id] !== 1) {
            throw new Error('Build element must be immutable: ' + id);
          }
          const stream = await utils.renderRsc(entries.elements, {
            etags: entries.etags,
          });
          await utils.generateFile(pathname, stream);
        });
      });
    }
    htmlTasks.forEach(runTask);
    await waitForTasks();
    await utils.saveBuildMetadata(
      ROUTER_METADATA.cachedElements,
      JSON.stringify(cachedElements),
    );
    await utils.saveBuildMetadata(
      ROUTER_METADATA.path2moduleIds,
      JSON.stringify(path2moduleIds),
    );
  };
