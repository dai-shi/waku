import ReactExports from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children } from '../client.js';
import type { Slot } from '../client.js';
import { getComponentIds, getInputString, parseInputString } from './common.js';
import type { RouteProps } from './common.js';

// eslint-disable-next-line import/no-named-as-default-member
const { createElement } = ReactExports;

const Default = ({ children }: { children: ReactNode }) => children;

// TODO implement
const ShoudSkipComponent = () =>
  createElement(
    'script',
    null,
    `
globalThis.__WAKU_ROUTER_SHOULD_SKIP__ = {
  'layout': { path: true },
};`,
  );

export function defineRouter<P>(
  existsPath: (path: string) => Promise<'static' | 'dynamic' | null>,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
  ) => Promise<FunctionComponent<P> | { default: FunctionComponent<P> } | null>,
  getPathsForBuild?: () => Promise<
    Iterable<{ path: string; searchParams?: URLSearchParams }>
  >,
): ReturnType<typeof defineEntries> {
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
          const mod = await getComponent(id);
          const component =
            typeof mod === 'function' ? mod : mod?.default || Default;
          const element = createElement(
            component as FunctionComponent<RouteProps>,
            props,
            createElement(Children),
          );
          return [[id, element]] as const;
        }),
      )
    ).flat();
    // TODO should we skip this for the second time?
    entries.push(['/SHOULD_SKIP', createElement(ShoudSkipComponent)]);
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
    if ((await existsPath(reqUrl.pathname)) !== (isPrd ? 'dynamic' : null)) {
      return null;
    }
    const componentIds = getComponentIds(reqUrl.pathname);
    const input = getInputString(reqUrl.pathname, reqUrl.searchParams);
    type Opts = {
      createElement: typeof createElement;
      Slot: typeof Slot;
    };
    const render = ({ createElement, Slot }: Opts) =>
      componentIds.reduceRight(
        (acc: ReactNode, id) => createElement(Slot, { id }, acc),
        null,
      );
    return { input, unstable_render: render };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}
