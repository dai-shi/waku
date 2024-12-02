import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { new_defineRouter, unstable_defineRouter } from './define-router.js';
import type { RouteProps } from './common.js';
import {
  joinPath,
  parsePathWithSlug,
  getPathMapping,
  path2regexp,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { Children, Slot, ThrowError_UNSTABLE } from '../minimal/client.js';

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

/** Assumes that the path is a part of a slug path. */
type IsValidPathItem<T> = T extends `/${string}` | '[]' | '' ? false : true;
/**
 * This is a helper type to check if a path is valid in a slug path.
 */
export type IsValidPathInSlugPath<T> = T extends `/${infer L}/${infer R}`
  ? IsValidPathItem<L> extends true
    ? IsValidPathInSlugPath<`/${R}`>
    : false
  : T extends `/${infer U}`
    ? IsValidPathItem<U>
    : false;
/** Checks if a particular slug name exists in a path. */
export type HasSlugInPath<T, K extends string> = T extends `/[${K}]/${infer _}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/[${K}]`
      ? true
      : false;

export type HasWildcardInPath<T> = T extends `/[...${string}]/${string}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasWildcardInPath<`/${U}`>
    : T extends `/[...${string}]`
      ? true
      : false;

export type PathWithSlug<T, K extends string> =
  IsValidPathInSlugPath<T> extends true
    ? HasSlugInPath<T, K> extends true
      ? T
      : never
    : never;

export type StaticSlugRoutePathsTuple<
  T extends string,
  Slugs extends unknown[] = GetSlugs<T>,
  Result extends readonly string[] = [],
> = Slugs extends []
  ? Result
  : Slugs extends [infer _, ...infer Rest]
    ? StaticSlugRoutePathsTuple<T, Rest, readonly [...Result, string]>
    : never;

type StaticSlugRoutePaths<T extends string> =
  HasWildcardInPath<T> extends true
    ? readonly string[] | readonly string[][]
    : StaticSlugRoutePathsTuple<T> extends readonly [string]
      ? readonly string[]
      : StaticSlugRoutePathsTuple<T>[];

/** Remove Slug from Path */
export type PathWithoutSlug<T> = T extends '/'
  ? T
  : IsValidPathInSlugPath<T> extends true
    ? HasSlugInPath<T, string> extends true
      ? never
      : T
    : never;

type PathWithStaticSlugs<T extends string> = T extends `/`
  ? T
  : IsValidPathInSlugPath<T> extends true
    ? T
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
  Render extends 'static' | 'dynamic',
  StaticPaths extends StaticSlugRoutePaths<Path>,
>(
  page: (
    | {
        render: Extract<Render, 'static'>;
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | {
        render: Extract<Render, 'static'>;
        path: PathWithStaticSlugs<Path>;
        staticPaths: StaticPaths;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | {
        render: Extract<Render, 'dynamic'>;
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | {
        render: Extract<Render, 'dynamic'>;
        path: PathWithWildcard<Path, SlugKey, WildSlugKey>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
  ) & { unstable_disableSSR?: boolean },
) => Omit<
  Exclude<typeof page, { path: never } | { render: never }>,
  'unstable_disableSSR'
>;

export type CreateLayout = <Path extends string>(layout: {
  render: 'static' | 'dynamic';
  path: PathWithoutSlug<Path>;
  component: FunctionComponent<
    Omit<RouteProps, 'query'> & { children: ReactNode }
  >;
}) => void;

type RootItem = {
  render: 'static' | 'dynamic';
  component: FunctionComponent<{ children: ReactNode }>;
};

export type CreateRoot = (root: RootItem) => void;

/**
 * Root component for all pages
 * ```tsx
 *   <html>
 *     <head></head>
 *     <body>{children}</body>
 *   </html>
 * ```
 */
const DefaultRoot = ({ children }: { children: ReactNode }) =>
  createElement(
    'html',
    null,
    createElement('head', null),
    createElement('body', null, children),
  );

const createNestedElements = (
  elements: {
    component: FunctionComponent<any>;
    props?: Record<string, unknown>;
  }[],
) => {
  return elements.reduceRight<ReactNode>(
    (result, element) =>
      createElement(element.component, element.props, result),
    null,
  );
};

export function createPages<
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
  }) => Promise<AllPages>,
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
  let rootItem: RootItem | undefined = undefined;
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
      throw new Error('createPage no longer available');
    }
    const pathSpec = parsePathWithSlug(page.path);
    if (page.unstable_disableSSR) {
      noSsrSet.add(pathSpec);
    }
    const { numSlugs, numWildcards } = (() => {
      let numSlugs = 0;
      let numWildcards = 0;
      for (const slug of pathSpec) {
        if (slug.type !== 'literal') {
          numSlugs++;
        }
        if (slug.type === 'wildcard') {
          numWildcards++;
        }
      }
      return { numSlugs, numWildcards };
    })();
    if (page.render === 'static' && numSlugs === 0) {
      staticPathSet.add([page.path, pathSpec]);
      const id = joinPath(page.path, 'page').replace(/^\//, '');
      registerStaticComponent(id, page.component);
    } else if (
      page.render === 'static' &&
      numSlugs > 0 &&
      'staticPaths' in page
    ) {
      const staticPaths = page.staticPaths.map((item) =>
        (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
      );
      for (const staticPath of staticPaths) {
        if (staticPath.length !== numSlugs && numWildcards === 0) {
          throw new Error('staticPaths does not match with slug pattern');
        }
        const mapping: Record<string, string | string[]> = {};
        let slugIndex = 0;
        const pathItems: string[] = [];
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
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
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

  const createRoot: CreateRoot = (root) => {
    if (configured) {
      throw new Error('createRoot no longer available');
    }
    if (rootItem) {
      throw new Error(`Duplicated root component`);
    }
    if (root.render === 'static' || root.render === 'dynamic') {
      rootItem = root;
    } else {
      throw new Error('Invalid root configuration');
    }
  };

  let ready: Promise<AllPages | void> | undefined;
  const configure = async () => {
    if (!configured && !ready) {
      ready = fn({ createPage, createLayout, createRoot });
      await ready;
      configured = true;
    }
    await ready;
  };

  const definedRouter = unstable_defineRouter(
    async () => {
      await configure();
      const paths: {
        pattern: string;
        path: PathSpec;
        isStatic: boolean;
        noSsr: boolean;
      }[] = [];
      for (const [path, pathSpec] of staticPathSet) {
        const noSsr = noSsrSet.has(pathSpec);
        const isStatic = (() => {
          for (const [_, [layoutPathSpec]] of dynamicLayoutPathMap) {
            if (hasPathSpecPrefix(layoutPathSpec, pathSpec)) {
              return false;
            }
          }
          return true;
        })();

        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic,
          noSsr,
        });
      }
      for (const [path, [pathSpec]] of dynamicPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic: false,
          noSsr,
        });
      }
      for (const [path, [pathSpec]] of wildcardPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: pathSpec,
          isStatic: false,
          noSsr,
        });
      }
      return paths;
    },
    async (id, { unstable_setShouldSkip }) => {
      await configure();
      if (id === 'root') {
        if (rootItem?.render === 'dynamic') {
          unstable_setShouldSkip();
        } else {
          unstable_setShouldSkip([]);
        }
        return rootItem?.component ?? DefaultRoot;
      }
      const staticComponent = staticComponentMap.get(id);
      if (staticComponent) {
        unstable_setShouldSkip([]);
        return staticComponent;
      }
      for (const [_, [pathSpec, Component]] of dynamicPagePathMap) {
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
      for (const [_, [pathSpec, Component]] of wildcardPagePathMap) {
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
      for (const [_, [pathSpec, Component]] of dynamicLayoutPathMap) {
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

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
}

export const new_createPages = <
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
  }) => Promise<AllPages>,
) => {
  let configured = false;

  const pathMap = new Map<
    string,
    {
      type: 'static' | 'dynamic' | 'wildcard';
      pathSpec: PathSpec;
      component: FunctionComponent<any>;
      mapping?: Record<string, string | string[]>;
      noSsr?: boolean;
    }
  >();
  /**
   * lookup from staticPath member to path in pathMap
   *
   * For /test/[a]/[b] and staticPaths of [['a', 'b'], ['c', 'd']]
   * staticPathMap will be:
   * {
   *   '/test/a/b': '/test/[a]/[b]',
   *   '/test/c/d': '/test/[a]/[b]',
   * }
   */
  const staticPathMap = new Map<string, string>();
  const StaticPageWrapper: FunctionComponent<{
    component: FunctionComponent<any>;
    mapping: Record<string, string | string[]>;
    props: Record<string, unknown>;
  }> = ({ component: Component, mapping, props }) => {
    return createElement(Component, { ...props, ...mapping });
  };
  const layoutMap = new Map<
    string,
    {
      type: 'static' | 'dynamic';
      component: FunctionComponent<any>;
      pathSpec?: PathSpec | undefined;
    }
  >();
  let rootItem: RootItem | undefined = undefined;

  const getRoutePath = (path: string): string | undefined => {
    // check static paths first
    for (const [storedPath, config] of pathMap) {
      if (config.type !== 'static') {
        continue;
      }
      if (storedPath === path) {
        return storedPath;
      } else if (staticPathMap.has(path)) {
        return staticPathMap.get(path)!;
      }
    }

    // check dynamic and wildcard paths
    for (const [storedPath, config] of pathMap) {
      if (
        config.type !== 'static' &&
        new RegExp(path2regexp(parsePathWithSlug(storedPath))).test(path)
      ) {
        return storedPath;
      }
    }
  };

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }

    const pathSpec = parsePathWithSlug(page.path);
    const { numSlugs, numWildcards } = countSlugsAndWildcards(pathSpec);

    if (page.render === 'static' && numSlugs === 0) {
      if (pathMap.has(page.path)) {
        throw new Error('Duplicated static path: ' + page.path);
      }
      pathMap.set(page.path, {
        type: 'static',
        pathSpec,
        component: page.component,
        noSsr: !!page.unstable_disableSSR,
      });
    } else if (
      page.render === 'static' &&
      numSlugs > 0 &&
      'staticPaths' in page
    ) {
      const staticPaths = page.staticPaths.map((item) =>
        (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
      );

      if (staticPaths.some((staticPath) => !staticPath.length)) {
        throw new Error('staticPaths must not be empty: [] is invalid');
      }

      const mismatchedStaticPaths = staticPaths.filter(
        (staticPath) => staticPath.length !== numSlugs && numWildcards === 0,
      );
      if (mismatchedStaticPaths.length) {
        throw new Error(
          'staticPaths does not match with slug pattern: ' +
            JSON.stringify(mismatchedStaticPaths),
        );
      }

      for (const staticPath of staticPaths) {
        const { path } = generateStaticPathMapping(pathSpec, staticPath);
        if (staticPathMap.has(path)) {
          throw new Error('Duplicated static path: ' + page.path);
        }
        staticPathMap.set(path, page.path);
      }

      pathMap.set(page.path, {
        type: 'static',
        pathSpec,
        component: page.component,
        noSsr: !!page.unstable_disableSSR,
      });
    } else if (page.render === 'dynamic') {
      const type = numWildcards === 0 ? 'dynamic' : 'wildcard';
      const maybeExistingPath = pathMap.get(page.path);
      if (
        staticPathMap.has(page.path) || // fixed static path exists
        (maybeExistingPath && maybeExistingPath.type !== 'static') // dynamic slug repeat
      ) {
        throw new Error(`Duplicated ${type} path: ${page.path}`);
      }

      pathMap.set(page.path, {
        type,
        pathSpec,
        component: page.component,
        noSsr: !!page.unstable_disableSSR,
      });
    } else {
      throw new Error('Invalid page configuration');
    }

    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }

    layoutMap.set(layout.path, {
      type: layout.render,
      component: layout.component,
      pathSpec:
        layout.render === 'dynamic'
          ? parsePathWithSlug(layout.path)
          : undefined,
    });
  };

  const createRoot: CreateRoot = (root) => {
    if (configured) {
      throw new Error('createRoot no longer available');
    }
    if (rootItem) {
      throw new Error('Duplicated root component');
    }
    rootItem = root;
  };

  let ready: Promise<AllPages | void> | undefined;
  const configure = async () => {
    if (!configured && !ready) {
      ready = fn({ createPage, createLayout, createRoot });
      await ready;
      configured = true;
      ready = undefined; // Clear the promise to free memory
    }
  };

  const getLayouts = (spec: PathSpec): string[] => {
    const pathSegments = spec.reduce<string[]>(
      (acc, segment, index) => {
        if (acc[index - 1] === '/') {
          acc.push('/' + segment);
        } else {
          acc.push(acc[index - 1] + '/' + segment);
        }
        return acc;
      },
      ['/'],
    );

    return pathSegments.filter((segment) => layoutMap.has(segment));
  };

  const definedRouter = new_defineRouter({
    getPathConfig: async () => {
      await configure();
      const paths = [];

      for (const [path, config] of pathMap) {
        const layoutPaths = getLayouts(config.pathSpec);
        const elements = {
          root: { isStatic: !rootItem || rootItem.render === 'static' },
          [`page:${path}`]: { isStatic: config.type === 'static' },
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: layoutMap.get(lPath)?.type === 'static',
              };
              return acc;
            },
            {},
          ),
        };

        paths.push({
          pattern: path2regexp(parsePathWithSlug(path)),
          path: config.pathSpec,
          routeElement: { isStatic: true },
          elements,
          noSsr: config.noSsr || false,
        });
      }

      return paths;
    },

    renderRoute: async (path, { query }) => {
      await configure();

      const routePath = getRoutePath(path);
      if (!routePath) {
        throw new Error('Route not found: ' + path);
      }

      const pageConfig = pathMap.get(routePath)!;
      const mapping =
        pageConfig.mapping || getPathMapping(pageConfig.pathSpec, path)!;

      const result: Record<string, ReactNode> = {
        root: createElement(
          rootItem ? rootItem.component : DefaultRoot,
          null,
          createElement(Children),
        ),
      };

      result[`page:${routePath}`] = pageConfig.mapping
        ? createElement(StaticPageWrapper, {
            component: pageConfig.component,
            mapping,
            props: query ? { query } : {},
          })
        : createElement(
            pageConfig.component,
            { ...mapping, ...(query ? { query } : {}) },
            createElement(Children),
          );

      const layoutPaths = getLayouts(pageConfig.pathSpec);
      for (const segment of layoutPaths) {
        const layout = layoutMap.get(segment);
        if (layout) {
          result[`layout:${segment}`] = createElement(
            layout.component,
            null,
            createElement(Children),
          );
        }
      }

      const routeChildren = [
        ...layoutPaths.map((lPath) => ({
          component: Slot,
          props: { id: `layout:${lPath}` },
        })),
        { component: Slot, props: { id: `page:${routePath}` } },
      ];

      return {
        elements: result,
        routeElement: createElement(
          Slot,
          { id: 'root' },
          createNestedElements(routeChildren),
        ),
        // HACK this is hard-coded convention
        // FIXME we should revisit the error boundary use case design
        fallbackElement: createElement(
          Slot,
          { id: 'root', unstable_renderPrev: true },
          layoutPaths.includes('/')
            ? createElement(
                Slot,
                { id: 'layout:/', unstable_renderPrev: true },
                createElement(ThrowError_UNSTABLE),
              )
            : createElement(ThrowError_UNSTABLE),
        ),
      };
    },
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void
    >;
  };
};

function countSlugsAndWildcards(pathSpec: PathSpec) {
  let numSlugs = 0;
  let numWildcards = 0;
  for (const slug of pathSpec) {
    if (slug.type !== 'literal') {
      numSlugs++;
    }
    if (slug.type === 'wildcard') {
      numWildcards++;
    }
  }
  return { numSlugs, numWildcards };
}

function generateStaticPathMapping(pathSpec: PathSpec, staticPath: string[]) {
  const mapping: Record<string, string | string[]> = {};
  let slugIndex = 0;
  const pathItems: string[] = [];

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

  const literalPathSpec: PathSpec = pathItems.map((name) => ({
    type: 'literal',
    name,
  }));

  return {
    mapping,
    path: '/' + pathItems.join('/'),
    literalPathSpec,
  };
}
