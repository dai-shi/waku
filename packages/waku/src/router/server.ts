import { createElement, Fragment } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { defineEntries } from '../server.js';
import type { RenderEntries, GetBuildConfig, GetSsrConfig } from '../server.js';
import { Children, Slot } from '../client.js';
import {
  getComponentIds,
  getInputString,
  parseInputString,
  PARAM_KEY_SKIP,
  SHOULD_SKIP_ID,
} from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';
import {
  joinPath,
  parsePathWithSlug,
  getPathMapping,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';

const ShoudSkipComponent = ({ shouldSkip }: { shouldSkip: ShouldSkip }) =>
  createElement('meta', {
    name: 'waku-should-skip',
    content: JSON.stringify(shouldSkip),
  });

export function unstable_defineRouter(
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
          const component = mod && 'default' in mod ? mod.default : mod;
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
      isStatic: boolean;
      entries: { input: string; isStatic: boolean }[];
      customCode: string;
    }[] = [];
    for (const path of pathsForBuild || []) {
      const isStatic = (await existsPath(path)) === 'static';
      const input = getInputString(path);
      const entries = [{ input, isStatic }];
      buildConfig.push({ pathname: path, isStatic, entries, customCode });
    }
    return buildConfig;
  };

  const getSsrConfig: GetSsrConfig = async (pathname) => {
    const pathType = await existsPath(pathname);
    if (pathType === null) {
      return null;
    }
    const componentIds = getComponentIds(pathname);
    const input = getInputString(pathname);
    const body = createElement(
      Fragment,
      null,
      createElement(Slot, { id: SHOULD_SKIP_ID }),
      componentIds.reduceRight(
        (acc: ReactNode, id) => createElement(Slot, { id, fallback: acc }, acc),
        null,
      ),
    );
    return { input, body };
  };

  return { renderEntries, getBuildConfig, getSsrConfig };
}

// createPages API (a wrapper around unstable_defineRouter)

// FIXME we should extract some functions (and type utils)
// out of this file, and add unit tests for them.
// Like: `src/router/utils.ts` and `src/router/utils.test.ts`

type IsValidPathItem<T> = T extends `/${infer _}`
  ? false
  : T extends '[]' | ''
    ? false
    : true;
type IsValidPath<T> = T extends `/${infer L}/${infer R}`
  ? IsValidPathItem<L> extends true
    ? IsValidPath<`/${R}`>
    : false
  : T extends `/${infer U}`
    ? IsValidPathItem<U>
    : false;
type HasSlugInPath<T, K extends string> = T extends `/[${K}]/${infer _}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/[${K}]`
      ? true
      : false;
type PathWithSlug<T, K extends string> =
  IsValidPath<T> extends true
    ? HasSlugInPath<T, K> extends true
      ? T
      : never
    : never;
type PathWithoutSlug<T> = T extends '/'
  ? T
  : IsValidPath<T> extends true
    ? HasSlugInPath<T, string> extends true
      ? never
      : T
    : never;

type CreatePage = <
  Path extends string,
  SlugKey extends string,
  WildSlugKey extends string,
>(
  page:
    | {
        render: 'static';
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<RouteProps>;
      }
    | {
        render: 'static';
        path: PathWithSlug<Path, SlugKey>;
        staticPaths: string[] | string[][];
        component: FunctionComponent<RouteProps & Record<SlugKey, string>>;
      }
    | {
        render: 'dynamic';
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<RouteProps>;
      }
    | {
        render: 'dynamic';
        path: PathWithSlug<Path, SlugKey | `...${WildSlugKey}`>;
        component: FunctionComponent<
          RouteProps & Record<SlugKey, string> & Record<WildSlugKey, string[]>
        >;
      },
) => void;

type CreateLayout = <T extends string>(layout: {
  render: 'static';
  path: PathWithoutSlug<T>;
  component: FunctionComponent<RouteProps & { children: ReactNode }>;
}) => void;

const splitPath = (path: string): string[] => {
  const p = path.replace(/^\//, '');
  if (!p) {
    return [];
  }
  return p.split('/');
};

export function createPages(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
  }) => Promise<void>,
): ReturnType<typeof defineEntries> {
  let configured = false;
  const staticPathSet = new Set<string>();
  const dynamicPathMap = new Map<string, [PathSpec, FunctionComponent<any>]>();
  const wildcardPathMap = new Map<string, [PathSpec, FunctionComponent<any>]>();
  const staticComponentMap = new Map<string, FunctionComponent<any>>();
  const registerStaticComponent = (
    id: string,
    component: FunctionComponent<any>,
  ) => {
    if (
      staticComponentMap.has(id) &&
      staticComponentMap.get(id) !== component
    ) {
      throw new Error(`Duplicated component for: ${id}`);
    }
    staticComponentMap.set(id, component);
  };

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('no longer available');
    }
    const pathSpec = parsePathWithSlug(page.path);
    const numSlugs = pathSpec.filter(({ type }) => type !== 'literal').length;
    const numWildcards = pathSpec.filter(
      ({ type }) => type === 'wildcard',
    ).length;
    if (page.render === 'static' && numSlugs === 0) {
      staticPathSet.add(page.path);
      const id = joinPath(page.path, 'page').replace(/^\//, '');
      registerStaticComponent(id, page.component);
    } else if (page.render === 'static' && numSlugs > 0 && numWildcards === 0) {
      const staticPaths = (
        page as {
          staticPaths: string[] | string[][];
        }
      ).staticPaths.map((item) => (Array.isArray(item) ? item : [item]));
      for (const staticPath of staticPaths) {
        if (staticPath.length !== numSlugs) {
          throw new Error('staticPaths does not match with slug pattern');
        }
        const mapping: Record<string, string> = {};
        let slugIndex = 0;
        const pathItems = pathSpec.map(({ type, name }) => {
          if (type !== 'literal') {
            const actualName = staticPath[slugIndex++]!;
            if (name) {
              mapping[name] = actualName;
            }
            return actualName;
          }
          return name;
        });
        staticPathSet.add('/' + joinPath(...pathItems));
        const id = joinPath(...pathItems, 'page');
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(page.component as any, { ...props, ...mapping });
        registerStaticComponent(id, WrappedComponent);
      }
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      if (dynamicPathMap.has(page.path)) {
        throw new Error(`Duplicated dynamic path: ${page.path}`);
      }
      dynamicPathMap.set(page.path, [pathSpec, page.component]);
    } else if (page.render === 'dynamic' && numWildcards === 1) {
      if (wildcardPathMap.has(page.path)) {
        throw new Error(`Duplicated dynamic path: ${page.path}`);
      }
      wildcardPathMap.set(page.path, [pathSpec, page.component]);
    } else {
      throw new Error('Invalid page configuration');
    }
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('no longer available');
    }
    const id = joinPath(layout.path, 'layout').replace(/^\//, '');
    registerStaticComponent(id, layout.component);
  };

  const ready = fn({ createPage, createLayout }).then(() => {
    configured = true;
  });

  return unstable_defineRouter(
    async (path: string) => {
      await ready;
      if (staticPathSet.has(path)) {
        return 'static';
      }
      for (const [parsedPath] of dynamicPathMap.values()) {
        const mapping = getPathMapping(parsedPath, splitPath(path));
        if (mapping) {
          return 'dynamic';
        }
      }
      for (const [parsedPath] of wildcardPathMap.values()) {
        const mapping = getPathMapping(parsedPath, splitPath(path));
        if (mapping) {
          return 'dynamic';
        }
      }
      return null; // not found
    },
    async (id, unstable_setShouldSkip) => {
      await ready;
      const staticComponent = staticComponentMap.get(id);
      if (staticComponent) {
        unstable_setShouldSkip({});
        return staticComponent;
      }
      for (const [pathSpec, Component] of dynamicPathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id.split('/'),
        );
        if (mapping) {
          if (Object.keys(mapping).length === 0) {
            unstable_setShouldSkip();
            return Component;
          }
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(Component, { ...props, ...mapping });
          unstable_setShouldSkip();
          return WrappedComponent;
        }
      }
      for (const [pathSpec, Component] of wildcardPathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id.split('/'),
        );
        if (mapping) {
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(Component, { ...props, ...mapping });
          unstable_setShouldSkip();
          return WrappedComponent;
        }
      }
      unstable_setShouldSkip({}); // negative cache
      return null; // not found
    },
    async () => staticPathSet,
  );
}
