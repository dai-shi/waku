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
const prefetcher = (pathname: string, search: string) => {
  const input = getInputString(pathname, search);
  return [[input]] as const;
};

const Default = ({ children }: { children: ReactNode }) => children;

export function defineRouter<P>(
  getComponent: (
    componentId: string,
  ) => Promise<FunctionComponent<P> | { default: FunctionComponent<P> } | null>,
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
    const paths = await getPathsForBuild();
    const path2moduleIds: Record<string, string[]> = {};
    for (const path of paths) {
      const url = new URL(path, 'http://localhost');
      const input = getInputString(url.pathname, url.search);
      const moduleIds = await unstable_collectClientModules(input);
      path2moduleIds[path] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (pathname, search) => {
  const path = pathname + (search ? '?' + search : '');
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    return paths.map((path) => {
      const url = new URL(path, 'http://localhost');
      return {
        pathname: url.pathname,
        search: url.search || undefined,
        entries: prefetcher(url.pathname, url.search),
        customCode,
      };
    });
  };

  const getSsrConfig: GetSsrConfig = async (reqUrl) => {
    const componentIds = getComponentIds(reqUrl.pathname);
    const leafComponentId = componentIds[componentIds.length - 1];
    if (!leafComponentId || (await getComponent(leafComponentId)) === null) {
      return null;
    }
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
