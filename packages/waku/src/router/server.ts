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

// We have to make prefetcher consistent with client behavior
const prefetcher = (
  path: string,
  searchParamsList: Iterable<URLSearchParams> | undefined,
) =>
  Array.from(searchParamsList || []).map(
    (searchParams) => [getInputString(path, searchParams)] as const,
  );

const Default = ({ children }: { children: ReactNode }) => children;

// TODO will review this again
type RoutePaths = {
  static?: Iterable<string>;
  staticSearchParams?: (path: string) => Iterable<URLSearchParams>;
  dynamic?: (path: string) => Promise<boolean>;
};

export function defineRouter<P>(
  getRoutePaths: () => Promise<RoutePaths>,
  getComponent: (
    componentId: string,
  ) => Promise<FunctionComponent<P> | { default: FunctionComponent<P> } | null>,
): ReturnType<typeof defineEntries> {
  const routePathsPromise = getRoutePaths();
  const existsRoutePathPromise = routePathsPromise.then((routePaths) => {
    const staticPathSet = new Set<string>();
    for (const path of routePaths.static || []) {
      staticPathSet.add(path);
    }
    const existsRoutePath = async (path: string) => {
      if (staticPathSet.has(path)) {
        return true;
      }
      if (await routePaths.dynamic?.(path)) {
        return true;
      }
      return false;
    };
    return existsRoutePath;
  });

  const renderEntries: RenderEntries = async (input) => {
    const { path, searchParams, skip } = parseInputString(input);
    const existsRoutePath = await existsRoutePathPromise;
    if (!(await existsRoutePath(path))) {
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
    return Object.fromEntries(entries);
  };

  const getBuildConfig: GetBuildConfig = async (
    unstable_collectClientModules,
  ) => {
    const routePaths = await routePathsPromise;
    const path2moduleIds: Record<string, string[]> = {};
    for (const path of routePaths.static || []) {
      for (const searchParams of [
        new URLSearchParams(),
        ...(routePaths.staticSearchParams?.(path) || []),
      ]) {
        const input = getInputString(path, searchParams);
        const moduleIds = await unstable_collectClientModules(input);
        const search = searchParams.toString();
        path2moduleIds[path + (search ? '?' + search : '')] = moduleIds;
      }
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
    return Array.from(routePaths.static || []).map((path) => {
      return {
        pathname: path,
        entries: prefetcher(path, routePaths.staticSearchParams?.(path)),
        customCode,
      };
    });
  };

  const getSsrConfig: GetSsrConfig = async (reqUrl) => {
    const existsRoutePath = await existsRoutePathPromise;
    if (!(await existsRoutePath(reqUrl.pathname))) {
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
