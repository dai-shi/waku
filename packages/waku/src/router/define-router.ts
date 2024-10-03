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
  getInputString,
  parseInputString,
  SHOULD_SKIP_ID,
  ROUTE_ID,
  HAS404_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';
import { getPathMapping } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter } from './client.js';

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
    componentId: string, // "**/layout" or "**/page"
    options: {
      // TODO setShouldSkip API is too hard to understand
      unstable_setShouldSkip: (val?: ShouldSkipValue) => void;
    },
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RoutePropsForLayout>
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
  const renderEntries: RenderEntries = async (input, { params }) => {
    const pathname = parseInputString(input);
    const pathStatus = await existsPath(pathname);
    if (!pathStatus.found) {
      return null;
    }
    const shouldSkipObj: {
      [componentId: ShouldSkip[number][0]]: ShouldSkip[number][1];
    } = {};

    const parsedParams = safeJsonParse(params);

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
          const setShoudSkip = (val?: ShouldSkipValue) => {
            if (val) {
              shouldSkipObj[id] = val;
            } else {
              delete shouldSkipObj[id];
            }
          };
          const component = await getComponent(id, {
            unstable_setShouldSkip: setShoudSkip,
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
        const input = getInputString(pathname);
        path2moduleIds[pattern] = await unstable_collectClientModules(input);
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
        const input = getInputString(pathname);
        entries.push({ input, isStatic });
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
    const input = getInputString(pathname);
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
      input,
      params: JSON.stringify({ query: searchParams.toString() }),
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
  const input = getInputString(pathname);
  rerender(input, { query, skip });
}
