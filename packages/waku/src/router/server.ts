import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children } from '../client.js';
import type { Slot } from '../client.js';
import { getComponentIds, getInputString, parseInputString } from './common.js';
import type { RouteProps } from './common.js';
import { joinPath } from '../lib/utils/path.js';

// We have to make prefetcher consistent with client behavior
const prefetcher = (pathname: string, search: string) => {
  const input = getInputString(pathname, search);
  return [[input]] as const;
};

const Default = ({ children }: { children: ReactNode }) => children;

type RoutePaths = {
  static?: Iterable<{ pathname: string; search?: string }>;
  dynamic?: (pathname: string, search?: string) => Promise<boolean>;
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
    for (const { pathname, search } of routePaths.static || []) {
      staticPathSet.add(pathname + (search ? '?' + search : ''));
    }
    const existsRoutePath = async (pathname: string, search: string) => {
      if (staticPathSet.has(pathname + (search ? '?' + search : ''))) {
        return true;
      }
      if (await routePaths.dynamic?.(pathname, search)) {
        return true;
      }
      return false;
    };
    return existsRoutePath;
  });

  const renderEntries: RenderEntries = async (input) => {
    const { pathname, search, skip } = parseInputString(input);
    const existsRoutePath = await existsRoutePathPromise;
    if (!(await existsRoutePath(pathname, search))) {
      return null;
    }
    const componentIds = getComponentIds(pathname);
    const props: RouteProps = { path: pathname, search };
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
    for (const { pathname, search } of routePaths.static || []) {
      const input = getInputString(pathname, search || '');
      const moduleIds = await unstable_collectClientModules(input);
      path2moduleIds[pathname + (search ? '?' + search : '')] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = pathname + (search ? '?' + search : '');
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    return Array.from(routePaths.static || []).map(({ pathname, search }) => {
      return {
        pathname,
        search,
        entries: prefetcher(pathname, search || ''),
        customCode,
      };
    });
  };

  const getSsrConfig: GetSsrConfig = async (reqUrl) => {
    const existsRoutePath = await existsRoutePathPromise;
    if (!(await existsRoutePath(reqUrl.pathname, reqUrl.search))) {
      return null;
    }
    const componentIds = getComponentIds(reqUrl.pathname);
    const input = getInputString(reqUrl.pathname, reqUrl.search);
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

// LIMITATION: No layout supported. Layout can be a performance benefit.
type CreatePage = (page: {
  dynamic?: boolean;
  path: string;
  component: FunctionComponent;
}) => void;

export function createPages(
  fn: (createPage: CreatePage) => Promise<void>,
): ReturnType<typeof defineEntries> {
  const staticPaths: { pathname: string; search?: string }[] = [];
  const componentMap = new Map<string, FunctionComponent>();
  let finished = false;
  const createPage: CreatePage = (page) => {
    if (finished) {
      throw new Error('no longer available');
    }
    if (page.dynamic) {
      // TODO implement
      throw new Error('not implemented yet');
    }
    const [pathname, search] = page.path.split('?') as [string, string?];
    staticPaths.push(search ? { pathname, search } : { pathname });
    const id = joinPath(pathname, 'page').replace(/^\//, '');
    if (componentMap.has(id) && componentMap.get(id) !== page.component) {
      throw new Error(`Duplicated component for: ${pathname}`);
    }
    componentMap.set(id, page.component);
  };
  const ready = fn(createPage).then(() => {
    finished = true;
  });
  return defineRouter(
    async () => {
      await ready;
      return { static: staticPaths };
    },
    async (id) => {
      await ready;
      return componentMap.get(id) || null;
    },
  );
}
