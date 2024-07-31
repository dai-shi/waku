import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { unstable_defineRouter } from './define-router.js';
import type { RouteProps } from './common.js';
import {
  joinPath,
  parsePathWithSlug,
  getPathMapping,
  path2regexp,
} from '../lib/utils/path.js';
import type { BuildConfig } from '../server.js';
import type { PathSpec } from '../lib/utils/path.js';

const hasPathSpecPrefix = (prefix: PathSpec, path: PathSpec) => {
  for (let i = 0; i < prefix.length; i++) {
    if (
      i >= path.length ||
      prefix[i]!.type !== path[i]!.type ||
      prefix[i]!.name !== path[i]!.name
    ) {
      return false;
    }
  }
  return true;
};

const sanitizeSlug = (slug: string) =>
  slug.replace(/\./g, '').replace(/ /g, '-');

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

export type PathWithSlug<T, K extends string> =
  IsValidPath<T> extends true
    ? HasSlugInPath<T, K> extends true
      ? T
      : never
    : never;
export type PathWithoutSlug<T> = T extends '/'
  ? T
  : IsValidPath<T> extends true
    ? HasSlugInPath<T, string> extends true
      ? never
      : T
    : never;

export type PathWithWildcard<
  Path,
  SlugKey extends string,
  WildSlugKey extends string,
> = PathWithSlug<Path, SlugKey | `...${WildSlugKey}`>;

export type CreatePage = <
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
        path: PathWithWildcard<Path, SlugKey, WildSlugKey>;
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
        path: PathWithWildcard<Path, SlugKey, WildSlugKey>;
        component: FunctionComponent<
          RouteProps & Record<SlugKey, string> & Record<WildSlugKey, string[]>
        >;
      }
  ) & { unstable_disableSSR?: boolean },
) => void;

export type CreateLayout = <T extends string>(layout: {
  render: 'static' | 'dynamic';
  path: PathWithoutSlug<T>;
  component: FunctionComponent<
    Omit<RouteProps, 'searchParams'> & { children: ReactNode }
  >;
}) => void;

export function createPages(
  fn: (
    fns: {
      createPage: CreatePage;
      createLayout: CreateLayout;
      unstable_setBuildData: (path: string, data: unknown) => void;
    },
    opts: {
      unstable_buildConfig: BuildConfig | undefined;
    },
  ) => Promise<void>,
) {
  let configured = false;

  // TODO I think there's room for improvement to refactor these structures
  const staticPathSet = new Set<[string, PathSpec]>();
  const dynamicPagePathMap = new Map<
    string,
    [PathSpec, FunctionComponent<any>]
  >();
  const wildcardPagePathMap = new Map<
    string,
    [PathSpec, FunctionComponent<any>]
  >();
  const dynamicLayoutPathMap = new Map<
    string,
    [PathSpec, FunctionComponent<any>]
  >();
  const staticComponentMap = new Map<string, FunctionComponent<any>>();
  const noSsrSet = new WeakSet<PathSpec>();
  const buildDataMap = new Map<string, unknown>();

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
      staticPathSet.add([page.path, pathSpec]);
      const id = joinPath(page.path, 'page').replace(/^\//, '');
      registerStaticComponent(id, page.component);
    } else if (page.render === 'static' && numSlugs > 0) {
      const staticPaths = (
        page as {
          staticPaths: string[] | string[][];
        }
      ).staticPaths.map((item) =>
        (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
      );
      for (const staticPath of staticPaths) {
        if (staticPath.length !== numSlugs && numWildcards === 0) {
          throw new Error('staticPaths does not match with slug pattern');
        }
        const mapping: Record<string, string | string[]> = {};
        let slugIndex = 0;
        const pathItems = [] as string[];
        pathSpec.forEach(({ type, name }) => {
          switch (type) {
            case 'literal':
              pathItems.push(name!);
              break;
            case 'wildcard':
              mapping[name!] = staticPath.slice(slugIndex);
              staticPath.slice(slugIndex++).forEach((slug) => {
                pathItems.push(slug);
              });
              break;
            case 'group':
              pathItems.push(staticPath[slugIndex++]!);
              mapping[name!] = pathItems[pathItems.length - 1]!;
              break;
          }
        });
        staticPathSet.add([
          page.path,
          pathItems.map((name) => ({ type: 'literal', name })),
        ]);
        const id = joinPath(...pathItems, 'page');
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(page.component as any, { ...props, ...mapping });
        registerStaticComponent(id, WrappedComponent);
      }
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      if (dynamicPagePathMap.has(page.path)) {
        throw new Error(`Duplicated dynamic path: ${page.path}`);
      }
      dynamicPagePathMap.set(page.path, [pathSpec, page.component]);
    } else if (page.render === 'dynamic' && numWildcards === 1) {
      if (wildcardPagePathMap.has(page.path)) {
        throw new Error(`Duplicated dynamic path: ${page.path}`);
      }
      wildcardPagePathMap.set(page.path, [pathSpec, page.component]);
    } else {
      throw new Error('Invalid page configuration');
    }
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('no longer available');
    }
    if (layout.render === 'static') {
      const id = joinPath(layout.path, 'layout').replace(/^\//, '');
      registerStaticComponent(id, layout.component);
    } else if (layout.render === 'dynamic') {
      if (dynamicLayoutPathMap.has(layout.path)) {
        throw new Error(`Duplicated dynamic path: ${layout.path}`);
      }
      const pathSpec = parsePathWithSlug(layout.path);
      dynamicLayoutPathMap.set(layout.path, [pathSpec, layout.component]);
    } else {
      throw new Error('Invalid layout configuration');
    }
  };

  const unstable_setBuildData = (path: string, data: unknown) => {
    buildDataMap.set(path, data);
  };

  let ready: Promise<void> | undefined;
  const configure = async (buildConfig?: BuildConfig) => {
    if (!configured && !ready) {
      ready = fn(
        { createPage, createLayout, unstable_setBuildData },
        { unstable_buildConfig: buildConfig },
      );
      await ready;
      configured = true;
    }
    await ready;
  };

  return unstable_defineRouter(
    async () => {
      await configure();
      const paths: {
        pattern: string;
        path: PathSpec;
        isStatic: boolean;
        noSsr: boolean;
        data: unknown;
      }[] = [];
      for (const [path, pathSpec] of staticPathSet) {
        const noSsr = noSsrSet.has(pathSpec);
        const isStatic = Array.from(dynamicLayoutPathMap.values()).every(
          ([layoutPathSpec]) => !hasPathSpecPrefix(layoutPathSpec, pathSpec),
        );
        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic,
          noSsr,
          data: buildDataMap.get(path),
        });
      }
      for (const [path, [pathSpec]] of dynamicPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic: false,
          noSsr,
          data: buildDataMap.get(path),
        });
      }
      for (const [path, [pathSpec]] of wildcardPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic: false,
          noSsr,
          data: buildDataMap.get(path),
        });
      }
      return paths;
    },
    async (id, { unstable_setShouldSkip, unstable_buildConfig }) => {
      await configure(unstable_buildConfig);
      const staticComponent = staticComponentMap.get(id);
      if (staticComponent) {
        unstable_setShouldSkip([]);
        return staticComponent;
      }
      for (const [pathSpec, Component] of dynamicPagePathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id,
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
      for (const [pathSpec, Component] of wildcardPagePathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'page' }],
          id,
        );
        if (mapping) {
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(Component, { ...props, ...mapping });
          unstable_setShouldSkip();
          return WrappedComponent;
        }
      }
      for (const [pathSpec, Component] of dynamicLayoutPathMap.values()) {
        const mapping = getPathMapping(
          [...pathSpec, { type: 'literal', name: 'layout' }],
          id,
        );
        if (mapping) {
          if (Object.keys(mapping).length) {
            throw new Error('[Bug] layout should not have slugs');
          }
          unstable_setShouldSkip();
          return Component;
        }
      }
      unstable_setShouldSkip([]); // negative cache
      return null; // not found
    },
  );
}
