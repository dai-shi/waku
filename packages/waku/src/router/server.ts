import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children, Slot } from '../client.js';
import { getComponentIds, getInputString, parseInputString } from './common.js';
import type { RouteProps } from './common.js';

// We have to make prefetcher consistent with client behavior
const prefetcher = (pathname: string) => {
  const search = ''; // XXX this is a limitation
  const input = getInputString(pathname, search);
  return [[input]] as const;
};

const Default = ({ children }: { children: ReactNode }) => children;

export function defineRouter(
  getComponent: (
    componentId: string,
  ) => Promise<FunctionComponent | { default: FunctionComponent } | null>,
  getPathsForBuild: () => Promise<string[]>,
): ReturnType<typeof defineEntries> {
  const renderEntries: RenderEntries = async (input) => {
    const { pathname, search, skip } = parseInputString(input);
    const componentIds = getComponentIds(pathname);
    const leafComponentId = componentIds[componentIds.length - 1];
    if (!leafComponentId || (await getComponent(leafComponentId)) === null) {
      return null;
    }
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
    const pathnames = await getPathsForBuild();
    const path2moduleIds: Record<string, string[]> = {};
    for (const pathname of pathnames) {
      const search = ''; // XXX this is a limitation
      const input = getInputString(pathname, search);
      const moduleIds = await unstable_collectClientModules(input);
      path2moduleIds[pathname] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = search ? pathname + "?" + search : pathname;
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    return Object.fromEntries(
      pathnames.map((pathname) => [
        pathname,
        { entries: prefetcher(pathname), customCode },
      ]),
    );
  };

  const getSsrConfig: GetSsrConfig = async (pathStr) => {
    const url = new URL(pathStr, 'http://localhost');
    const componentIds = getComponentIds(url.pathname);
    const leafComponentId = componentIds[componentIds.length - 1];
    if (!leafComponentId || (await getComponent(leafComponentId)) === null) {
      return null;
    }
    const input = getInputString(url.pathname, url.search);
    const render = () =>
      componentIds.reduceRight(
        (acc: ReactNode, id) => createElement(Slot, { id }, acc),
        null,
      );
    return { input, unstable_render: render };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}
