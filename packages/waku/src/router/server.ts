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
import { joinPath } from '../lib/utils/path.js';

const Default = ({ children }: RouteProps & { children: ReactNode }) =>
  children;

const ShoudSkipComponent = ({ shouldSkip }: { shouldSkip: ShouldSkip }) =>
  createElement('meta', {
    name: 'waku-should-skip',
    content: JSON.stringify(shouldSkip),
  });

export function defineRouter<P>(
  existsPath: (path: string) => Promise<'static' | 'dynamic' | null>,
  getComponent: (
    componentId: string, // "**/layout" or "**/page"
    unstable_setShouldSkip: (val?: ShouldSkip[string]) => void,
  ) => Promise<FunctionComponent<P> | { default: FunctionComponent<P> } | null>,
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
          (acc: ReactNode, id) => createElement(Slot, { id }, acc),
          null,
        ),
      );
    return { input, unstable_render: render };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}

// createPages API (a wrapper around defineRouter)

type NonEmpty<T> = T extends '' ? false : true;
type IsValidPath<T> = T extends `${infer L}/${infer R}`
  ? NonEmpty<L> extends true
    ? IsValidPath<R>
    : false
  : NonEmpty<T>;
type IsSlug<T> = T extends `[${infer U}]` ? NonEmpty<U> : false;
type IsNotSlug<T> = T extends `[${string}]` ? false : NonEmpty<T>;
type IsPathElementWithSlug<T> = T extends `${infer L}/${infer R}`
  ? IsSlug<L> extends true
    ? IsValidPath<R>
    : IsPathElementWithSlug<R>
  : IsSlug<T>;
type IsPathElementWithoutSlug<T> = T extends `${infer L}/${infer R}`
  ? IsNotSlug<L> extends true
    ? IsPathElementWithoutSlug<R>
    : IsSlug<L> extends true
      ? false
      : IsValidPath<R>
  : IsNotSlug<T>;
type PathWithSlug<T> = T extends '/'
  ? T
  : T extends `/${infer U}`
    ? IsPathElementWithSlug<U> extends true
      ? T
      : never
    : never;
type PathWithoutSlug<T> = T extends '/'
  ? T
  : T extends `/${infer U}`
    ? IsPathElementWithoutSlug<U> extends true
      ? T
      : never
    : never;

type CreatePage = <T extends string>(
  page:
    | {
        render: 'static';
        path: PathWithoutSlug<T>;
        component: FunctionComponent<RouteProps>;
      }
    | {
        render: 'static';
        path: PathWithSlug<T>;
        staticPaths: string[] | string[][];
        component: FunctionComponent<RouteProps>;
      }
    | {
        render: 'dynamic';
        path: PathWithoutSlug<T> | PathWithSlug<T>;
        component: FunctionComponent<RouteProps>;
      },
) => void;

type CreateLayout = <T extends string>(layout: {
  render: 'static';
  path: PathWithoutSlug<T>;
  component: FunctionComponent<
    Omit<RouteProps, 'searchParams'> & { children: ReactNode }
  >;
}) => void;

export function createPages(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
  }) => Promise<void>,
): ReturnType<typeof defineEntries> {
  const staticPathSet = new Set<string>();
  // TODO dynamic & wildcard
  // const dynamicPaths: { item: string; isSlug: boolean }[] = [];
  // const wildcardPaths: { item: string; isSlug: boolean }[] = [];
  const componentMap = new Map<
    string,
    FunctionComponent<RouteProps & { children: ReactNode }>
  >();
  let finished = false;
  const createPage: CreatePage = (page) => {
    if (finished) {
      throw new Error('no longer available');
    }
    staticPathSet.add(page.path);
    const id = joinPath(page.path, 'page').replace(/^\//, '');
    if (componentMap.has(id) && componentMap.get(id) !== page.component) {
      throw new Error(`Duplicated component for: ${page.path}`);
    }
    componentMap.set(id, page.component);
  };
  const createLayout: CreateLayout = (layout) => {
    if (finished) {
      throw new Error('no longer available');
    }
    const id = joinPath(layout.path, 'layout').replace(/^\//, '');
    if (componentMap.has(id) && componentMap.get(id) !== layout.component) {
      throw new Error(`Duplicated component for: ${layout.component}`);
    }
    componentMap.set(id, layout.component);
  };
  const ready = fn({ createPage, createLayout }).then(() => {
    finished = true;
  });
  return defineRouter(
    async (path: string) => {
      await ready;
      return staticPathSet.has(path) ? 'static' : null;
    },
    async (id, unstable_setShouldSkip) => {
      await ready;
      unstable_setShouldSkip({}); // for static paths
      return componentMap.get(id) || null;
    },
    async () => Array.from(staticPathSet).map((path) => ({ path })),
  );
}
