import {
  unstable_base64ToBytes as base64ToBytes,
  unstable_createCustomError as createCustomError,
  unstable_getErrorInfo as getErrorInfo,
} from '../../minimal/server.js';
import type { unstable_defineHandlers as defineHandlers } from '../../minimal/server.js';
import { INTERNAL_ServerRouter } from '../client.js';
import { getPathMapping } from '../isomorphic-utils/path-spec.js';
import {
  decodeSliceId,
  encodeRoutePath,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import { DEFINE_ROUTER_METADATA } from './build-metadata.js';
import {
  getRouterPrefetchCode,
  setupRouterSearchCodecs,
} from './client-code.js';
import type { ConfigRegistry } from './config-registry.js';
import { createElementCache } from './element-cache.js';
import { getNonce, setRerender } from './request-store.js';
import type { RouteEntries, createRouteEntries } from './route-entries.js';

type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
type HandlerInput = Parameters<HandleRequest>[0];

export const createRequestHandler = ({
  configRegistry,
  routeEntries,
  runHandled,
}: {
  configRegistry: ConfigRegistry;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(req: Request, fn: () => Promise<T>) => Promise<T>;
}): HandleRequest => {
  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedPath2moduleIds: Record<string, string[]> | undefined;

  return async (input, { renderRsc, renderHtml, loadBuildMetadata }) => {
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
            routeEntries.getEntriesForRoute(
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

      const handleRscRequest = async ({
        rscPath,
        rscParams,
      }: Extract<HandlerInput, { type: 'rsc' }>) => {
        const sliceId = decodeSliceId(rscPath);
        if (sliceId !== null) {
          const entries = await routeEntries.getEntriesForSlice(
            sliceId,
            requestElementCache,
          );
          if (!entries) {
            return null;
          }
          return renderRsc(entries.elements, { etags: entries.etags });
        }
        const entries = await routeEntries.getEntriesForRoute(
          rscPath,
          rscParams,
          clientEtags,
          requestElementCache,
        );
        if (!entries) {
          return null;
        }
        return renderRsc(entries.elements, { etags: entries.etags });
      };

      const handleCallRequest = async ({
        fn,
        args,
      }: Extract<HandlerInput, { type: 'call' }>) => {
        try {
          const { value, entries } = await withRerender(() => fn(...args));
          return renderRsc(entries.elements, { value, etags: entries.etags });
        } catch (e) {
          const info = getErrorInfo(e);
          if (info?.location) {
            const routePath = pathnameToRoutePath(info.location);
            const rscPath = encodeRoutePath(routePath);
            const entries = await routeEntries.getEntriesForRoute(
              rscPath,
              undefined,
              clientEtags,
              requestElementCache,
            );
            if (!entries) {
              throw createCustomError('Not Found', { status: 404 });
            }
            return renderRsc(entries.elements, { etags: entries.etags });
          }
          throw e;
        }
      };

      const handleHttpRequest = async ({
        pathname,
        req,
        tryAction,
      }: Extract<HandlerInput, { type: 'http' }>) => {
        const pathConfigItem = configRegistry.findPathConfig(pathname);
        if (pathConfigItem?.type === 'api') {
          const url = new URL(req.url);
          url.pathname = pathname;
          const apiReq = new Request(url, req);
          const params = getPathMapping(pathConfigItem.path, pathname) ?? {};
          return pathConfigItem.handler(apiReq, { params });
        }
        const renderPage = async (
          pathname: string,
          query: string,
          status = 200,
        ) => {
          const routePath = pathnameToRoutePath(pathname);
          const rscPath = encodeRoutePath(routePath);
          const rscParams = new URLSearchParams({ query });
          let entries = await routeEntries.getEntriesForRoute(
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
          if (tryAction) {
            const { value, entries: rerendered } =
              await withRerender(tryAction);
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
        const url = new URL(req.url);
        const query = url.searchParams.toString();
        if (pathConfigItem?.noSsr) {
          return 'fallback';
        }
        try {
          if (pathConfigItem) {
            return await renderPage(pathname, query);
          }
        } catch (e) {
          const info = getErrorInfo(e);
          if (info?.status !== 404) {
            throw e;
          }
        }
        if (configRegistry.has404()) {
          return renderPage('/404', '', 404);
        } else {
          return null;
        }
      };

      if (input.type === 'rsc') {
        return handleRscRequest(input);
      }
      if (input.type === 'call') {
        return handleCallRequest(input);
      }
      if (input.type === 'http') {
        return handleHttpRequest(input);
      }
    });
  };
};
