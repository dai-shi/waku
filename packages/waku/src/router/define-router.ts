import { createElement } from 'react';
import type { ComponentProps, FunctionComponent, ReactNode } from 'react';

import { defineEntries, rerender } from '../server.js';
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
  COMPONENT_CONFIGS_ID,
  LOCATION_ID,
} from './common.js';
import type { RouteProps, ComponentConfigs } from './common.js';
import { getPathMapping } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { ServerRouter } from './client.js';

type RoutePropsForLayout = Omit<RouteProps, 'query'> & {
  children: ReactNode;
};

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
      data?: unknown; // For build: put in customData
    }>
  >,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
    options: {
      unstable_setComponentConfig: (
        ...args: [render?: 'static' | 'dynamic']
      ) => void;
      unstable_buildConfig: BuildConfig | undefined;
    },
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RoutePropsForLayout>
    | null
  >,
): ReturnType<typeof defineEntries> {
  type MyPathConfig = {
    pattern: string;
    pathname: PathSpec;
    isStatic?: boolean | undefined;
    customData: { noSsr?: boolean; is404: boolean; data: unknown };
  }[];
  let cachedPathConfig: MyPathConfig | undefined;
  const getMyPathConfig = async (
    buildConfig?: BuildConfig,
  ): Promise<MyPathConfig> => {
    if (buildConfig) {
      return buildConfig as MyPathConfig;
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
          customData: { is404, noSsr: !!item.noSsr, data: item.data },
        };
      });
    }
    return cachedPathConfig;
  };
  const existsPath = async (
    pathname: string,
    buildConfig: BuildConfig | undefined,
  ): Promise<['FOUND', 'NO_SSR'?] | ['NOT_FOUND', 'HAS_404'?]> => {
    const pathConfig = await getMyPathConfig(buildConfig);
    const found = pathConfig.find(({ pathname: pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    return found
      ? found.customData.noSsr
        ? ['FOUND', 'NO_SSR']
        : ['FOUND']
      : pathConfig.some(({ customData: { is404 } }) => is404) // FIXMEs should avoid re-computation
        ? ['NOT_FOUND', 'HAS_404']
        : ['NOT_FOUND'];
  };
  const renderEntries: RenderEntries = async (
    input,
    { params, buildConfig },
  ) => {
    const pathname = parseInputString(input);
    if ((await existsPath(pathname, buildConfig))[0] === 'NOT_FOUND') {
      return null;
    }
    const componentConfigs: ComponentConfigs = {};

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
          const setComponentConfig = (
            ...args: [render?: 'static' | 'dynamic']
          ) => {
            componentConfigs[id] = args;
          };
          const component = await getComponent(id, {
            unstable_setComponentConfig: setComponentConfig,
            unstable_buildConfig: buildConfig,
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
    entries.push([COMPONENT_CONFIGS_ID, Object.entries(componentConfigs)]);
    entries.push([LOCATION_ID, [pathname, query]]);
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
    for (const { pathname: pathSpec, isStatic, customData } of pathConfig) {
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
          (customData.is404 ? 'globalThis.__WAKU_ROUTER_404__ = true;' : ''),
        customData,
      });
    }
    return buildConfig;
  };

  const getSsrConfig: GetSsrConfig = async (
    pathname,
    { searchParams, buildConfig },
  ) => {
    const pathStatus = await existsPath(pathname, buildConfig);
    if (pathStatus[1] === 'NO_SSR') {
      return null;
    }
    if (pathStatus[0] === 'NOT_FOUND') {
      if (pathStatus[1] === 'HAS_404') {
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

export function unstable_redirect(
  pathname: string,
  query?: string,
  skip?: string[], // FIXME how could we specify this??
) {
  const input = getInputString(pathname);
  rerender(input, { query, skip });
}
