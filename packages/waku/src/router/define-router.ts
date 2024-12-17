import { createElement } from 'react';
import type { ReactNode } from 'react';

import { unstable_getPlatformObject } from '../server.js';
import { unstable_defineEntries as defineEntries } from '../minimal/server.js';
import {
  encodeRoutePath,
  decodeRoutePath,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
  SKIP_HEADER,
} from './common.js';
import { getPathMapping } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter } from './client.js';
import { getContext } from '../middleware/context.js';

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

export function unstable_rerenderRoute(pathname: string, query?: string) {
  const rscPath = encodeRoutePath(pathname);
  getRerender()(rscPath, query && new URLSearchParams({ query }));
}

type SlotId = string;

const ROUTE_SLOT_ID_PREFIX = 'route:';

export function unstable_defineRouter(fns: {
  getPathConfig: () => Promise<
    Iterable<{
      pattern: string; // TODO we should probably remove this and use path2regexp internally
      path: PathSpec;
      routeElement: { isStatic?: boolean };
      elements: Record<SlotId, { isStatic?: boolean }>;
      noSsr?: boolean;
    }>
  >;
  renderRoute: (
    path: string,
    options: {
      query?: string;
    },
  ) => Promise<{
    routeElement: ReactNode;
    elements: Record<SlotId, ReactNode>;
    fallbackElement?: ReactNode;
  }>;
}) {
  const platformObject = unstable_getPlatformObject();
  type MyPathConfig = {
    pattern: string;
    pathname: PathSpec;
    staticElementIds: SlotId[];
    isStatic?: boolean | undefined;
    specs: { noSsr?: boolean; is404: boolean };
  }[];
  let cachedPathConfig: MyPathConfig | undefined;
  const getMyPathConfig = async (): Promise<MyPathConfig> => {
    const pathConfig = platformObject.buildData?.defineRouterPathConfigs;
    if (pathConfig) {
      return pathConfig as MyPathConfig;
    }
    if (!cachedPathConfig) {
      cachedPathConfig = Array.from(await fns.getPathConfig()).map((item) => {
        const is404 =
          item.path.length === 1 &&
          item.path[0]!.type === 'literal' &&
          item.path[0]!.name === '404';
        return {
          pattern: item.pattern,
          pathname: item.path,
          staticElementIds: Object.entries(item.elements).flatMap(
            ([id, { isStatic }]) => (isStatic ? [id] : []),
          ),
          isStatic:
            !!item.routeElement.isStatic &&
            Object.values(item.elements).every((x) => x.isStatic),
          specs: { is404, noSsr: !!item.noSsr },
        };
      });
    }
    return cachedPathConfig;
  };
  const existsPath = async (
    pathname: string,
  ): Promise<
    (
      | {
          found: true;
          isStatic: boolean;
          noSsr: boolean;
        }
      | {
          found: false;
        }
    ) & {
      has404: boolean;
    }
  > => {
    const pathConfig = await getMyPathConfig();
    const found = pathConfig.find(({ pathname: pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    const has404 = pathConfig.some(({ specs: { is404 } }) => is404);
    return found
      ? {
          found: true,
          has404,
          isStatic: !!found.isStatic,
          noSsr: !!found.specs.noSsr,
        }
      : {
          found: false,
          has404,
        };
  };
  const filterEffectiveSkip = async (
    pathname: string,
    skip: string[],
  ): Promise<string[]> => {
    const pathConfig = await getMyPathConfig();
    return skip.filter((slotId) => {
      const found = pathConfig.find(({ pathname: pathSpec }) =>
        getPathMapping(pathSpec, pathname),
      );
      return !!found && found.staticElementIds.includes(slotId);
    });
  };
  const getEntries = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
  ) => {
    const pathname = decodeRoutePath(rscPath);
    const pathStatus = await existsPath(pathname);
    if (!pathStatus.found) {
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
    const { routeElement, elements, fallbackElement } = await fns.renderRoute(
      pathname,
      pathStatus.isStatic ? {} : { query },
    );
    if (
      Object.keys(elements).some((id) => id.startsWith(ROUTE_SLOT_ID_PREFIX))
    ) {
      throw new Error('Element ID cannot start with "route:"');
    }
    const entries = {
      ...elements,
      [ROUTE_SLOT_ID_PREFIX + pathname]: routeElement,
      ...((fallbackElement ? { fallback: fallbackElement } : {}) as Record<
        string,
        ReactNode
      >),
    };
    for (const skipId of await filterEffectiveSkip(pathname, skip)) {
      delete entries[skipId];
    }
    entries[ROUTE_ID] = [pathname, query];
    entries[IS_STATIC_ID] = pathStatus.isStatic;
    if (pathStatus.has404) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  type GetBuildConfig = Parameters<typeof defineEntries>[0]['getBuildConfig'];

  const getBuildConfig: GetBuildConfig = async ({
    unstable_collectClientModules,
  }) => {
    const pathConfig = await getMyPathConfig();
    const path2moduleIds: Record<string, string[]> = {};

    await Promise.all(
      pathConfig.map(async ({ pathname: pathSpec, pattern }) => {
        if (pathSpec.some(({ type }) => type !== 'literal')) {
          return;
        }
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        const entries = await getEntries(rscPath, undefined, {});
        if (entries) {
          path2moduleIds[pattern] =
            await unstable_collectClientModules(entries);
        }
      }),
    );

    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = ${JSON.stringify(path2moduleIds)};
  const pattern = Object.keys(path2ids).find((key) => new RegExp(key).test(path));
  if (pattern && path2ids[pattern]) {
    for (const id of path2ids[pattern] || []) {
      import(id);
    }
  }
};`;
    type BuildConfig = Awaited<ReturnType<GetBuildConfig>>;
    const buildConfig: BuildConfig = [];
    for (const { pathname: pathSpec, isStatic, specs } of pathConfig) {
      const entries: BuildConfig[number]['entries'] = [];
      if (pathSpec.every(({ type }) => type === 'literal')) {
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        entries.push({ rscPath, isStatic });
      }
      buildConfig.push({
        pathSpec: pathSpec,
        isStatic,
        entries,
        customCode:
          customCode +
          (specs.is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : ''),
      });
    }
    platformObject.buildData ||= {};
    platformObject.buildData.defineRouterPathConfigs = pathConfig;
    return buildConfig;
  };

  return defineEntries({
    handleRequest: async (input, { renderRsc, renderHtml }) => {
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
        let elementsPromise: Promise<Record<string, ReactNode>> =
          Promise.resolve({});
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
      if (input.type === 'action' || input.type === 'custom') {
        let pathname = input.pathname;
        const query = input.req.url.searchParams.toString();
        const pathStatus = await existsPath(pathname);
        if (pathStatus.found && pathStatus.noSsr) {
          return null;
        }
        if (!pathStatus.found) {
          if (pathStatus.has404) {
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
        return renderHtml(entries, html, rscPath, actionResult);
      }
    },
    getBuildConfig,
  });
}
