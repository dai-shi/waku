import { createElement } from 'react';
import type { ReactNode } from 'react';

import {
  unstable_getPlatformObject,
  unstable_createAsyncIterable as createAsyncIterable,
} from '../server.js';
import { unstable_defineEntries as defineEntries } from '../minimal/server.js';
import {
  encodeRoutePath,
  decodeRoutePath,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
  SKIP_HEADER,
} from './common.js';
import { getPathMapping, path2regexp } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter } from './client.js';
import { getContext } from '../middleware/context.js';
import { stringToStream } from '../lib/utils/stream.js';

const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((y) => typeof y === 'string');

const parseRscParams = (
  rscParams: unknown,
): {
  query: string;
} => {
  if (!(rscParams instanceof URLSearchParams)) {
    return { query: '' };
  }
  const query = rscParams.get('query') || '';
  return { query };
};

const RERENDER_SYMBOL = Symbol('RERENDER');
type Rerender = (rscPath: string, rscParams?: unknown) => void;

const setRerender = (rerender: Rerender) => {
  try {
    const context = getContext();
    (context as unknown as Record<typeof RERENDER_SYMBOL, Rerender>)[
      RERENDER_SYMBOL
    ] = rerender;
  } catch {
    // ignore
  }
};

const getRerender = (): Rerender => {
  const context = getContext();
  return (context as unknown as Record<typeof RERENDER_SYMBOL, Rerender>)[
    RERENDER_SYMBOL
  ];
};

const pathSpec2pathname = (pathSpec: PathSpec) => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    return undefined;
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

export function unstable_rerenderRoute(pathname: string, query?: string) {
  const rscPath = encodeRoutePath(pathname);
  getRerender()(rscPath, query && new URLSearchParams({ query }));
}

type SlotId = string;

const ROUTE_SLOT_ID_PREFIX = 'route:';

export function unstable_defineRouter(fns: {
  getRouteConfig: () => Promise<
    Iterable<{
      path: PathSpec;
      pathPattern?: PathSpec;
      routeElement: { isStatic?: boolean };
      elements: Record<SlotId, { isStatic?: boolean }>;
      noSsr?: boolean;
    }>
  >;
  handleRoute: (
    path: string,
    options: {
      query?: string;
    },
  ) => Promise<{
    routeElement: ReactNode;
    elements: Record<SlotId, ReactNode>;
  }>;
  getApiConfig?: () => Promise<
    Iterable<{
      path: PathSpec;
      isStatic?: boolean;
    }>
  >;
  handleApi?: (
    path: string,
    options: {
      body: ReadableStream | null;
      headers: Readonly<Record<string, string>>;
      method: string;
    },
  ) => Promise<{
    body?: ReadableStream;
    headers?: Record<string, string | string[]>;
    status?: number;
  }>;
}) {
  const platformObject = unstable_getPlatformObject();
  type MyPathConfig = {
    pathSpec: PathSpec;
    pathname: string | undefined;
    pattern: string;
    specs: {
      isStatic?: true;
      staticElementIds?: SlotId[];
      noSsr?: true;
      is404?: true;
      isApi?: true;
    };
  }[];
  let cachedPathConfig: MyPathConfig | undefined;
  const getMyPathConfig = async (): Promise<MyPathConfig> => {
    const pathConfig = platformObject.buildData?.defineRouterPathConfigs;
    if (pathConfig) {
      return pathConfig as MyPathConfig;
    }
    if (!cachedPathConfig) {
      cachedPathConfig = [
        ...Array.from(await fns.getRouteConfig()).map((item) => {
          const is404 =
            item.path.length === 1 &&
            item.path[0]!.type === 'literal' &&
            item.path[0]!.name === '404';
          const isStatic =
            !!item.routeElement.isStatic &&
            Object.values(item.elements).every((x) => x.isStatic);
          return {
            pathSpec: item.path,
            pathname: pathSpec2pathname(item.path),
            pattern: path2regexp(item.pathPattern || item.path),
            specs: {
              staticElementIds: Object.entries(item.elements).flatMap(
                ([id, { isStatic }]) => (isStatic ? [id] : []),
              ),
              ...(isStatic ? { isStatic: true as const } : {}),
              ...(is404 ? { is404: true as const } : {}),
              ...(item.noSsr ? { noSsr: true as const } : {}),
            },
          };
        }),
        ...Array.from((await fns.getApiConfig?.()) || []).map((item) => {
          return {
            pathSpec: item.path,
            pathname: pathSpec2pathname(item.path),
            pattern: path2regexp(item.path),
            specs: {
              ...(item.isStatic ? { isStatic: true as const } : {}),
              isApi: true as const,
            },
          };
        }),
      ];
    }
    return cachedPathConfig;
  };
  const getPathConfigItem = async (pathname: string) => {
    const pathConfig = await getMyPathConfig();
    const found = pathConfig.find(({ pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    return found;
  };
  const has404 = async () => {
    const pathConfig = await getMyPathConfig();
    return pathConfig.some(({ specs: { is404 } }) => is404);
  };
  const filterEffectiveSkip = async (
    pathname: string,
    skip: string[],
  ): Promise<string[]> => {
    const pathConfig = await getMyPathConfig();
    return skip.filter((slotId) => {
      const found = pathConfig.find(({ pathSpec }) =>
        getPathMapping(pathSpec, pathname),
      );
      return found?.specs.staticElementIds?.includes(slotId);
    });
  };
  const getEntries = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
  ) => {
    const pathname = decodeRoutePath(rscPath);
    const pathConfigItem = await getPathConfigItem(pathname);
    if (!pathConfigItem) {
      return null;
    }
    let skipParam: unknown;
    try {
      skipParam = JSON.parse(headers[SKIP_HEADER.toLowerCase()] || '');
    } catch {
      // ignore
    }
    const skip = isStringArray(skipParam) ? skipParam : [];
    const { query } = parseRscParams(rscParams);
    const { routeElement, elements } = await fns.handleRoute(
      pathname,
      pathConfigItem.specs.isStatic ? {} : { query },
    );
    if (
      Object.keys(elements).some((id) => id.startsWith(ROUTE_SLOT_ID_PREFIX))
    ) {
      throw new Error('Element ID cannot start with "route:"');
    }
    const entries = {
      ...elements,
      [ROUTE_SLOT_ID_PREFIX + pathname]: routeElement,
    };
    for (const skipId of await filterEffectiveSkip(pathname, skip)) {
      delete entries[skipId];
    }
    entries[ROUTE_ID] = [pathname, query];
    entries[IS_STATIC_ID] = !!pathConfigItem.specs.isStatic;
    if (await has404()) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  type HandleRequest = Parameters<typeof defineEntries>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineEntries>[0]['handleBuild'];
  type BuildConfig =
    NonNullable<ReturnType<HandleBuild>> extends AsyncIterable<infer T>
      ? T
      : never;

  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, renderHtml },
  ) => {
    if (input.type === 'component') {
      const entries = await getEntries(
        input.rscPath,
        input.rscParams,
        input.req.headers,
      );
      if (!entries) {
        return null;
      }
      return renderRsc(entries);
    }
    if (input.type === 'function') {
      let elementsPromise: Promise<Record<string, ReactNode>> = Promise.resolve(
        {},
      );
      let rendered = false;
      const rerender = async (rscPath: string, rscParams?: unknown) => {
        if (rendered) {
          throw new Error('already rendered');
        }
        elementsPromise = Promise.all([
          elementsPromise,
          getEntries(rscPath, rscParams, input.req.headers),
        ]).then(([oldElements, newElements]) => {
          if (newElements === null) {
            console.warn('getEntries returned null');
          }
          return {
            ...oldElements,
            ...newElements,
          };
        });
      };
      setRerender(rerender);
      const value = await input.fn(...input.args);
      rendered = true;
      return renderRsc({ ...(await elementsPromise), _value: value });
    }
    const pathConfigItem = await getPathConfigItem(input.pathname);
    if (pathConfigItem?.specs?.isApi && fns.handleApi) {
      return fns.handleApi(input.pathname, {
        body: input.req.body,
        headers: input.req.headers,
        method: input.req.method,
      });
    }
    if (input.type === 'action' || input.type === 'custom') {
      let pathname = input.pathname;
      const query = input.req.url.searchParams.toString();
      if (pathConfigItem?.specs?.noSsr) {
        return null;
      }
      if (!pathConfigItem) {
        if (await has404()) {
          pathname = '/404';
        } else {
          return null;
        }
      }
      const rscPath = encodeRoutePath(pathname);
      const rscParams = new URLSearchParams({ query });
      const entries = await getEntries(rscPath, rscParams, input.req.headers);
      if (!entries) {
        return null;
      }
      const html = createElement(ServerRouter, {
        route: { path: pathname, query, hash: '' },
      });
      const actionResult =
        input.type === 'action' ? await input.fn() : undefined;
      return renderHtml(entries, html, { rscPath, actionResult });
    }
  };

  type Tasks = Array<() => Promise<BuildConfig>>;
  const handleBuild: HandleBuild = ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    unstable_generatePrefetchCode,
    unstable_collectClientModules,
  }) =>
    createAsyncIterable(async (): Promise<Tasks> => {
      const tasks: Tasks = [];
      const pathConfig = await getMyPathConfig();

      for (const { pathname, specs } of pathConfig) {
        const { handleApi } = fns;
        if (pathname && specs.isStatic && specs.isApi && handleApi) {
          tasks.push(async () => ({
            type: 'file',
            pathname,
            body: handleApi(pathname, {
              body: null,
              headers: {},
              method: 'GET',
            }).then(({ body }) => body || stringToStream('')),
          }));
        }
      }

      const path2moduleIds: Record<string, string[]> = {};
      const moduleIdsForPrefetch = new WeakMap<PathSpec, Set<string>>();
      // FIXME this approach keeps all entries in memory during the loop
      const entriesCache = new Map<string, Record<string, ReactNode>>();
      await Promise.all(
        pathConfig.map(async ({ pathSpec, pathname, pattern, specs }) => {
          const moduleIds = new Set<string>();
          moduleIdsForPrefetch.set(pathSpec, moduleIds);
          if (!pathname) {
            return;
          }
          const rscPath = encodeRoutePath(pathname);
          const entries = await getEntries(rscPath, undefined, {});
          if (entries) {
            entriesCache.set(pathname, entries);
            path2moduleIds[pattern] =
              await unstable_collectClientModules(entries);
            if (specs.isStatic) {
              tasks.push(async () => ({
                type: 'file',
                pathname: rscPath2pathname(rscPath),
                body: renderRsc(entries, {
                  moduleIdCallback: (id) => moduleIds.add(id),
                }),
              }));
            }
          }
        }),
      );

      const getRouterPrefetchCode = () => `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = ${JSON.stringify(path2moduleIds)};
  const pattern = Object.keys(path2ids).find((key) => new RegExp(key).test(path));
  if (pattern && path2ids[pattern]) {
    for (const id of path2ids[pattern] || []) {
      import(id);
    }
  }
};`;

      for (const { pathSpec, pathname, specs } of pathConfig) {
        tasks.push(async () => {
          const moduleIds = moduleIdsForPrefetch.get(pathSpec)!;
          if (pathname) {
            const rscPath = encodeRoutePath(pathname);
            const code =
              unstable_generatePrefetchCode([rscPath], moduleIds) +
              getRouterPrefetchCode() +
              (specs.is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : '');
            const entries = entriesCache.get(pathname);
            if (specs.isStatic && entries) {
              const html = createElement(ServerRouter, {
                route: { path: pathname, query: '', hash: '' },
              });
              return {
                type: 'file',
                pathname,
                body: renderHtml(entries, html, {
                  rscPath,
                  htmlHead: `<script type="module" async>${code}</script>`,
                }).then(({ body }) => body),
              };
            }
          }
          const code =
            unstable_generatePrefetchCode([], moduleIds) +
            getRouterPrefetchCode() +
            (specs.is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : '');
          return {
            type: 'htmlHead',
            pathSpec,
            head: `<script type="module" async>${code}</script>`,
          };
        });
      }

      platformObject.buildData ||= {};
      platformObject.buildData.defineRouterPathConfigs = pathConfig;
      return tasks;
    });

  return defineEntries({ handleRequest, handleBuild });
}
