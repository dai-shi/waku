import { createElement } from 'react';
import type { ComponentProps, FunctionComponent, ReactNode } from 'react';

import {
  defineEntries,
  rerender,
  unstable_getPlatformObject,
} from '../server.js';
import type {
  BuildConfig,
  RenderEntries,
  GetBuildConfig,
  GetSsrConfig,
} from '../server.js';
import { Children, Slot } from '../client.js';
import {
  getComponentIds,
  encodeRoutePath,
  decodeRoutePath,
  SHOULD_SKIP_ID,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';
import { getPathMapping } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter, NewServerRouter } from './client.js';

type RoutePropsForLayout = Omit<RouteProps, 'query'> & {
  children: ReactNode;
};

type ShouldSkipValue = ShouldSkip[number][1];

const safeJsonParse = (str: unknown) => {
  if (typeof str === 'string') {
    try {
      const obj = JSON.parse(str);
      if (typeof obj === 'object') {
        return obj as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
};

export function unstable_defineRouter(
  getPathConfig: () => Promise<
    Iterable<{
      pattern: string;
      path: PathSpec;
      isStatic?: boolean;
      noSsr?: boolean;
    }>
  >,
  getComponent: (
    componentId: string, // "**/layout" or "**/page" or "root"
    options: {
      // TODO setShouldSkip API is too hard to understand
      unstable_setShouldSkip: (val?: ShouldSkipValue) => void;
    },
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RoutePropsForLayout>
    | FunctionComponent<{ children: ReactNode }>
    | null
  >,
): ReturnType<typeof defineEntries> {
  const platformObject = unstable_getPlatformObject();
  type MyPathConfig = {
    pattern: string;
    pathname: PathSpec;
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
      cachedPathConfig = Array.from(await getPathConfig()).map((item) => {
        const is404 =
          item.path.length === 1 &&
          item.path[0]!.type === 'literal' &&
          item.path[0]!.name === '404';
        return {
          pattern: item.pattern,
          pathname: item.path,
          isStatic: item.isStatic,
          specs: { is404, noSsr: !!item.noSsr },
        };
      });
    }
    return cachedPathConfig;
  };
  const existsPath = async (
    pathname: string,
  ): Promise<{
    found: boolean;
    has404: boolean;
    noSsr?: boolean;
  }> => {
    const pathConfig = await getMyPathConfig();
    const found = pathConfig.find(({ pathname: pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    const has404 = pathConfig.some(({ specs: { is404 } }) => is404);
    return found
      ? {
          found: true,
          has404,
          noSsr: !!found.specs.noSsr,
        }
      : {
          found: false,
          has404,
        };
  };
  const renderEntries: RenderEntries = async (rscPath, { rscParams }) => {
    const pathname = decodeRoutePath(rscPath);
    const pathStatus = await existsPath(pathname);
    if (!pathStatus.found) {
      return null;
    }
    const shouldSkipObj: {
      [componentId: ShouldSkip[number][0]]: ShouldSkip[number][1];
    } = {};

    const parsedParams = safeJsonParse(rscParams);

    const query =
      typeof parsedParams?.query === 'string' ? parsedParams.query : '';
    const skip = Array.isArray(parsedParams?.skip)
      ? (parsedParams.skip as unknown[])
      : [];
    const componentIds = getComponentIds(pathname);
    const entries: (readonly [string, ReactNode])[] = (
      await Promise.all(
        componentIds.map(async (id) => {
          if (skip?.includes(id)) {
            return [];
          }
          const setShouldSkip = (val?: ShouldSkipValue) => {
            if (val) {
              shouldSkipObj[id] = val;
            } else {
              delete shouldSkipObj[id];
            }
          };
          const component = await getComponent(id, {
            unstable_setShouldSkip: setShouldSkip,
          });
          if (!component) {
            return [];
          }
          const element = createElement(
            component as FunctionComponent<{
              path: string;
              query?: string;
            }>,
            id.endsWith('/layout')
              ? { path: pathname }
              : { path: pathname, query },
            createElement(Children),
          );
          return [[id, element]] as const;
        }),
      )
    ).flat();
    entries.push([SHOULD_SKIP_ID, Object.entries(shouldSkipObj)]);
    entries.push([ROUTE_ID, [pathname, query]]);
    if (pathStatus.has404) {
      entries.push([HAS404_ID, true]);
    }
    return Object.fromEntries(entries);
  };

  const getBuildConfig: GetBuildConfig = async (
    unstable_collectClientModules,
  ) => {
    const pathConfig = await getMyPathConfig();
    const path2moduleIds: Record<string, string[]> = {};

    await Promise.all(
      pathConfig.map(async ({ pathname: pathSpec, pattern }) => {
        if (pathSpec.some(({ type }) => type !== 'literal')) {
          return;
        }
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        path2moduleIds[pattern] = await unstable_collectClientModules(rscPath);
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
    const buildConfig: BuildConfig = [];
    for (const { pathname: pathSpec, isStatic, specs } of pathConfig) {
      const entries: BuildConfig[number]['entries'] = [];
      if (pathSpec.every(({ type }) => type === 'literal')) {
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        entries.push({ rscPath, isStatic });
      }
      buildConfig.push({
        pathname: pathSpec,
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

  const getSsrConfig: GetSsrConfig = async (pathname, { searchParams }) => {
    const pathStatus = await existsPath(pathname);
    if (pathStatus.noSsr) {
      return null;
    }
    if (!pathStatus.found) {
      if (pathStatus.has404) {
        pathname = '/404';
      } else {
        return null;
      }
    }
    const componentIds = getComponentIds(pathname);
    const rscPath = encodeRoutePath(pathname);
    const html = createElement(
      ServerRouter as FunctionComponent<
        Omit<ComponentProps<typeof ServerRouter>, 'children'>
      >,
      { route: { path: pathname, query: searchParams.toString(), hash: '' } },
      componentIds.reduceRight(
        (acc: ReactNode, id) => createElement(Slot, { id, fallback: acc }, acc),
        null,
      ),
    );
    return {
      rscPath,
      rscParams: JSON.stringify({ query: searchParams.toString() }),
      html,
    };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}

export function unstable_rerenderRoute(
  pathname: string,
  query?: string,
  skip?: string[], // TODO this is too hard to use
) {
  const rscPath = encodeRoutePath(pathname);
  rerender(rscPath, { query, skip });
}

// -----------------------------------------------------
// new_defineRouter
// Eventually replaces unstable_defineRouter
// -----------------------------------------------------

type ComponentId = string;

export function new_defineRouter(fns: {
  getPathConfig: () => Promise<
    Iterable<{
      pattern: string; // TODO let's revisit this later
      path: PathSpec;
      components: Record<
        ComponentId,
        {
          isStatic?: boolean;
        }
      >;
      noSsr?: boolean;
    }>
  >;
  renderRoute: (
    path: string,
    options: {
      query?: string;
      skip?: string[];
    },
  ) => Promise<Record<ComponentId, ReactNode>>;
}): ReturnType<typeof defineEntries> {
  const platformObject = unstable_getPlatformObject();
  type MyPathConfig = {
    pattern: string;
    pathname: PathSpec;
    componentIds: ComponentId[];
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
          componentIds: Object.keys(item.components),
          isStatic: Object.values(item.components).every((x) => x.isStatic),
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
  const renderEntries: RenderEntries = async (rscPath, { rscParams }) => {
    const pathname = decodeRoutePath(rscPath);
    const pathStatus = await existsPath(pathname);
    if (!pathStatus.found) {
      return null;
    }
    const parsedParams = safeJsonParse(rscParams);
    const query =
      typeof parsedParams?.query === 'string' ? parsedParams.query : '';
    const skip =
      Array.isArray(parsedParams?.skip) &&
      parsedParams.skip.every((x) => typeof x === 'string')
        ? (parsedParams.skip as string[])
        : [];
    const entries = await fns.renderRoute(
      pathname,
      pathStatus.isStatic ? {} : { query, skip },
    );
    entries[ROUTE_ID] = [pathname, query];
    entries[IS_STATIC_ID] = pathStatus.isStatic;
    if (pathStatus.has404) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  const getBuildConfig: GetBuildConfig = async (
    unstable_collectClientModules,
  ) => {
    const pathConfig = await getMyPathConfig();
    const path2moduleIds: Record<string, string[]> = {};

    await Promise.all(
      pathConfig.map(async ({ pathname: pathSpec, pattern }) => {
        if (pathSpec.some(({ type }) => type !== 'literal')) {
          return;
        }
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        path2moduleIds[pattern] = await unstable_collectClientModules(rscPath);
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
    const buildConfig: BuildConfig = [];
    for (const { pathname: pathSpec, isStatic, specs } of pathConfig) {
      const entries: BuildConfig[number]['entries'] = [];
      if (pathSpec.every(({ type }) => type === 'literal')) {
        const pathname = '/' + pathSpec.map(({ name }) => name).join('/');
        const rscPath = encodeRoutePath(pathname);
        entries.push({ rscPath, isStatic });
      }
      buildConfig.push({
        pathname: pathSpec,
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

  const getSsrConfig: GetSsrConfig = async (pathname, { searchParams }) => {
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
    const html = createElement(NewServerRouter, {
      route: { path: pathname, query: searchParams.toString(), hash: '' },
    });
    return {
      rscPath,
      rscParams: JSON.stringify({ query: searchParams.toString() }),
      html,
    };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}
