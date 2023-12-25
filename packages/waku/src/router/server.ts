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
  PARAM_KEY_SKIP,
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
  getPathsForBuild?: () => Promise<Iterable<string>>,
): ReturnType<typeof defineEntries> {
  const shouldSkip: ShouldSkip = {};

  const renderEntries: RenderEntries = async (input, searchParams) => {
    const path = parseInputString(input);
    if (!(await existsPath(path))) {
      return null;
    }
    const skip = searchParams.getAll(PARAM_KEY_SKIP) || [];
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
    const path2moduleIds: Record<string, string[]> = {};
    for (const path of pathsForBuild || []) {
      const input = getInputString(path);
      const moduleIds = await unstable_collectClientModules(input);
      path2moduleIds[path] = moduleIds;
    }
    const customCode = `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = ${JSON.stringify(path2moduleIds)};
  for (const id of path2ids[path] || []) {
    import(id);
  }
};`;
    const buildConfig: {
      pathname: string;
      entries: { input: string; isStatic: boolean }[];
      customCode: string;
    }[] = [];
    for (const path of pathsForBuild || []) {
      const isStatic = (await existsPath(path)) === 'static';
      const input = getInputString(path);
      const entries = [{ input, isStatic }];
      buildConfig.push({ pathname: path, entries, customCode });
    }
    return buildConfig;
  };

  const getSsrConfig: GetSsrConfig = async (pathname, { isPrd }) => {
    const pathType = await existsPath(pathname);
    if (isPrd ? pathType !== 'dynamic' : pathType === null) {
      return null;
    }
    const componentIds = getComponentIds(pathname);
    const input = getInputString(pathname);
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
