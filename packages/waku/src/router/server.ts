import { createElement } from 'react';
import type { Fragment, FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children } from '../client.js';
import type { Slot } from '../client.js';
import {
  getComponentIds,
  getInputString,
  parseInputString,
  SHOULD_SKIP_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';

const ShoudSkipComponent = ({ shouldSkip }: { shouldSkip: ShouldSkip }) =>
  createElement('meta', {
    name: 'waku-should-skip',
    content: JSON.stringify(shouldSkip),
  });

export function defineRouter(
  existsPath: (path: string) => Promise<'static' | 'dynamic' | null>,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
    unstable_setShouldSkip: (val?: ShouldSkip[string]) => void,
  ) => Promise<
    | FunctionComponent<RouteProps>
    | FunctionComponent<RouteProps & { children: ReactNode }>
    | { default: FunctionComponent<RouteProps> }
    | { default: FunctionComponent<RouteProps & { children: ReactNode }> }
    | null
  >,
  getPathsForBuild?: () => Promise<
    Iterable<{ path: string; searchParams?: URLSearchParams }>
  >,
): ReturnType<typeof defineEntries> {
  const shouldSkip: ShouldSkip = {};

  const renderEntries: RenderEntries = async (input) => {
    const { path, searchParams, skip } = parseInputString(input);
    if (!(await existsPath(path))) {
      return null;
    }
    const componentIds = getComponentIds(path);
    const props: RouteProps = { path, searchParams };
    const entries = (
      await Promise.all(
        componentIds.map(async (id) => {
          if (skip?.includes(id)) {
            return [];
          }
          const mod = await getComponent(id, (val) => {
            if (val) {
              shouldSkip[id] = val;
            } else {
              delete shouldSkip[id];
            }
          });
          const component = typeof mod === 'function' ? mod : mod?.default;
          if (!component) {
            return [];
          }
          const element = createElement(
            component as FunctionComponent<RouteProps>,
            props,
            createElement(Children),
          );
          return [[id, element]] as const;
        }),
      )
    ).flat();
    entries.push([
      SHOULD_SKIP_ID,
      createElement(ShoudSkipComponent, { shouldSkip }) as any,
    ]);
    return Object.fromEntries(entries);
  };

  const getBuildConfig: GetBuildConfig = async (
    unstable_collectClientModules,
  ) => {
    const pathsForBuild = await getPathsForBuild?.();
    const pathMap = new Map<
      string,
      { isStatic: boolean; searchParamsList: URLSearchParams[] }
    >();
    const path2moduleIds: Record<string, string[]> = {};
    for (const {
      path,
      searchParams = new URLSearchParams(),
    } of pathsForBuild || []) {
      let item = pathMap.get(path);
      if (!item) {
        item = {
          isStatic: (await existsPath(path)) === 'static',
          searchParamsList: [],
        };
        pathMap.set(path, item);
      }
      item.searchParamsList.push(searchParams);
      const input = getInputString(path, searchParams);
      const moduleIds = await unstable_collectClientModules(input);
      const search = searchParams.toString();
      path2moduleIds[path + (search ? '?' + search : '')] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, searchParams) => {
  const search = searchParams.toString();
  const pathStr = path + (search ? '?' + search : '');
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[pathStr] || []) {
    import(id);
  }
};`;
    return Array.from(pathMap.entries()).map(
      ([path, { isStatic, searchParamsList }]) => {
        const entries = searchParamsList.map((searchParams) => ({
          input: getInputString(path, searchParams),
          isStatic,
        }));
        return { pathname: path, entries, customCode };
      },
    );
  };

  // TODO this API is not very understandable and not consistent with RSC
  const getSsrConfig: GetSsrConfig = async (reqUrl, isPrd) => {
    const pathType = await existsPath(reqUrl.pathname);
    if (isPrd ? pathType !== 'dynamic' : pathType === null) {
      return null;
    }
    const componentIds = getComponentIds(reqUrl.pathname);
    const input = getInputString(reqUrl.pathname, reqUrl.searchParams);
    type Opts = {
      createElement: typeof createElement;
      Fragment: typeof Fragment;
      Slot: typeof Slot;
    };
    const render = ({ createElement, Fragment, Slot }: Opts) =>
      createElement(
        Fragment,
        null,
        createElement(Slot, { id: SHOULD_SKIP_ID }),
        componentIds.reduceRight(
          (acc: ReactNode, id) =>
            createElement(Slot, { id, fallback: (children) => children }, acc),
          null,
        ),
      );
    return { input, unstable_render: render };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}
