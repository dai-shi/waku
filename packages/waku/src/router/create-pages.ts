import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { unstable_defineRouter as defineRouter } from './define-router.js';
import type { RouteProps } from './common.js';
import {
  joinPath,
  parsePathWithSlug,
  getPathMapping,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';

// createPages API (a wrapper around unstable_defineRouter)

// FIXME we should add unit tests for some functions and type utils.

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
  page: (
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
      }
  ) & { unstable_disableSSR?: boolean },
) => void;

type CreateLayout = <T extends string>(layout: {
  render: 'static';
  path: PathWithoutSlug<T>;
  component: FunctionComponent<RouteProps & { children: ReactNode }>;
}) => void;

export function createPages(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
  }) => Promise<void>,
) {
  let configured = false;

  // TODO I think there's room for improvement to refactor these structures
  const staticPathSet = new Set<PathSpec>();
  const dynamicPathMap = new Map<string, [PathSpec, FunctionComponent<any>]>();
  const wildcardPathMap = new Map<string, [PathSpec, FunctionComponent<any>]>();
  const staticComponentMap = new Map<string, FunctionComponent<any>>();
  const noSsrSet = new WeakSet<PathSpec>();

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
    if (page.unstable_disableSSR) {
      noSsrSet.add(pathSpec);
    }
    const numSlugs = pathSpec.filter(({ type }) => type !== 'literal').length;
    const numWildcards = pathSpec.filter(
      ({ type }) => type === 'wildcard',
    ).length;
    if (page.render === 'static' && numSlugs === 0) {
      staticPathSet.add(pathSpec);
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
        staticPathSet.add(pathItems.map((name) => ({ type: 'literal', name })));
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

  return defineRouter(
    async () => {
      await ready;
      const paths: { path: PathSpec; isStatic: boolean; noSsr: boolean }[] = [];
      for (const pathSpec of staticPathSet) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({ path: pathSpec, isStatic: true, noSsr });
      }
      for (const [pathSpec] of dynamicPathMap.values()) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({ path: pathSpec, isStatic: false, noSsr });
      }
      for (const [pathSpec] of wildcardPathMap.values()) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({ path: pathSpec, isStatic: false, noSsr });
      }
      return paths;
    },
    async (id, setShouldSkip) => {
      await ready;
      const staticComponent = staticComponentMap.get(id);
      if (staticComponent) {
        setShouldSkip({});
        return staticComponent;
      }
      for (const [pathSpec, Component] of dynamicPathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id,
        );
        if (mapping) {
          if (Object.keys(mapping).length === 0) {
            setShouldSkip();
            return Component;
          }
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(Component, { ...props, ...mapping });
          setShouldSkip();
          return WrappedComponent;
        }
      }
      for (const [pathSpec, Component] of wildcardPathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id,
        );
        if (mapping) {
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(Component, { ...props, ...mapping });
          setShouldSkip();
          return WrappedComponent;
        }
      }
      setShouldSkip({}); // negative cache
      return null; // not found
    },
  );
}
