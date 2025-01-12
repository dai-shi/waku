import { createElement } from 'react';
import type { FunctionComponent, ReactNode } from 'react';

import { unstable_defineRouter } from './define-router.js';
import type { RouteProps } from './common.js';
import {
  joinPath,
  parsePathWithSlug,
  getPathMapping,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { Children, Slot } from '../minimal/client.js';
import { ErrorBoundary } from '../router/client.js';

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

export type CreateLayout = <Path extends string>(
  layout:
    | {
        render: 'dynamic';
        path: Path;
        component: FunctionComponent<
          Pick<RouteProps, 'path'> & { children: ReactNode }
        >;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<{ children: ReactNode }>;
      },
) => void;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type CreateApi = <Path extends string>(
  params:
    | {
        path: Path;
        mode: 'static';
        method: 'GET';
        handler: (req: Request) => Promise<Response>;
      }
    | {
        path: Path;
        mode: 'dynamic';
        method: Method;
        handler: (req: Request) => Promise<Response>;
      },
) => void;

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
    ErrorBoundary,
    null,
    createElement(
      'html',
      null,
      createElement('head', null),
      createElement('body', null, children),
    ),
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

export const createPages = <
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
    createApi: CreateApi;
  }) => Promise<AllPages>,
) => {
  let configured = false;

  const staticPathMap = new Map<
    string,
    { literalSpec: PathSpec; originalSpec?: PathSpec }
  >();
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
  const apiPathMap = new Map<
    string, // `${method} ${path}`
    {
      mode: 'static' | 'dynamic';
      pathSpec: PathSpec;
      handler: Parameters<CreateApi>[0]['handler'];
    }
  >();
  const staticApiPaths = new Set<string>();
  const staticComponentMap = new Map<string, FunctionComponent<any>>();
  let rootItem: RootItem | undefined = undefined;
  const noSsrSet = new WeakSet<PathSpec>();

  /** helper to find dynamic path when slugs are used */
  const getPageRoutePath: (path: string) => string | undefined = (path) => {
    if (staticComponentMap.has(joinPath(path, 'page').slice(1))) {
      return path;
    }
    const allPaths = [
      ...dynamicPagePathMap.keys(),
      ...wildcardPagePathMap.keys(),
    ];
    for (const p of allPaths) {
      if (getPathMapping(parsePathWithSlug(p), path)) {
        return p;
      }
    }
  };

  const getApiRoutePath: (
    path: string,
    method: string,
  ) => string | undefined = (path, method) => {
    for (const pathKey of apiPathMap.keys()) {
      const [m, p] = pathKey.split(' ');
      if (m === method && getPathMapping(parsePathWithSlug(p!), path)) {
        return p;
      }
    }
  };

  const pagePathExists = (path: string) => {
    for (const pathKey of apiPathMap.keys()) {
      const [_m, p] = pathKey.split(' ');
      if (p === path) {
        return true;
      }
    }
    return (
      staticPathMap.has(path) ||
      dynamicPagePathMap.has(path) ||
      wildcardPagePathMap.has(path)
    );
  };

  /** helper to get original static slug path */
  const getOriginalStaticPathSpec = (path: string) => {
    const staticPathSpec = staticPathMap.get(path);
    if (staticPathSpec) {
      return staticPathSpec.originalSpec ?? staticPathSpec.literalSpec;
    }
  };

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
    if (pagePathExists(page.path)) {
      throw new Error(`Duplicated path: ${page.path}`);
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
      staticPathMap.set(page.path, { literalSpec: pathSpec });
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
        staticPathMap.set('/' + pathItems.join('/'), {
          literalSpec: pathItems.map((name) => ({ type: 'literal', name })),
          originalSpec: pathSpec,
        });
        const id = joinPath(...pathItems, 'page');
        const WrappedComponent = (props: Record<string, unknown>) =>
          createElement(page.component as any, { ...props, ...mapping });
        registerStaticComponent(id, WrappedComponent);
      }
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      dynamicPagePathMap.set(page.path, [pathSpec, page.component]);
    } else if (page.render === 'dynamic' && numWildcards === 1) {
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

  const createApi: CreateApi = ({ path, mode, method, handler }) => {
    if (configured) {
      throw new Error('createApi no longer available');
    }
    if (apiPathMap.has(`${method} ${path}`)) {
      throw new Error(`Duplicated api path+method: ${path} ${method}`);
    } else if (mode === 'static' && staticApiPaths.has(path)) {
      throw new Error('Static API Routes cannot share paths: ' + path);
    }
    if (mode === 'static') {
      staticApiPaths.add(path);
    }
    const pathSpec = parsePathWithSlug(path);
    apiPathMap.set(`${method} ${path}`, { mode, pathSpec, handler });
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
      ready = fn({ createPage, createLayout, createRoot, createApi });
      await ready;
      configured = true;
    }
    await ready;
  };

  const getLayouts = (spec: PathSpec): string[] => {
    const pathSegments = spec.reduce<string[]>(
      (acc, _segment, index) => {
        acc.push(pathSpecAsString(spec.slice(0, index + 1)));
        return acc;
      },
      ['/'],
    );

    return pathSegments.filter(
      (segment) =>
        dynamicLayoutPathMap.has(segment) ||
        staticComponentMap.has(joinPath(segment, 'layout').slice(1)), // feels like a hack
    );
  };

  const definedRouter = unstable_defineRouter({
    getRouteConfig: async () => {
      await configure();
      const paths: {
        path: PathSpec;
        pathPattern?: PathSpec;
        rootElement: { isStatic?: boolean };
        routeElement: { isStatic?: boolean };
        elements: Record<string, { isStatic?: boolean }>;
        noSsr: boolean;
      }[] = [];
      const rootIsStatic = !rootItem || rootItem.render === 'static';

      for (const [path, { literalSpec, originalSpec }] of staticPathMap) {
        const noSsr = noSsrSet.has(literalSpec);

        const layoutPaths = getLayouts(originalSpec ?? literalSpec);

        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
          [`page:${path}`]: { isStatic: staticPathMap.has(path) },
        };

        paths.push({
          path: literalSpec,
          ...(originalSpec && { pathPattern: originalSpec }),
          rootElement: { isStatic: rootIsStatic },
          routeElement: {
            isStatic: true,
          },
          elements,
          noSsr,
        });
      }
      for (const [path, [pathSpec]] of dynamicPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        const layoutPaths = getLayouts(pathSpec);
        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
          [`page:${path}`]: { isStatic: false },
        };
        paths.push({
          path: pathSpec,
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        });
      }
      for (const [path, [pathSpec]] of wildcardPagePathMap) {
        const noSsr = noSsrSet.has(pathSpec);
        const layoutPaths = getLayouts(pathSpec);
        const elements = {
          ...layoutPaths.reduce<Record<string, { isStatic: boolean }>>(
            (acc, lPath) => {
              acc[`layout:${lPath}`] = {
                isStatic: !dynamicLayoutPathMap.has(lPath),
              };
              return acc;
            },
            {},
          ),
          [`page:${path}`]: { isStatic: false },
        };
        paths.push({
          path: pathSpec,
          rootElement: { isStatic: rootIsStatic },
          routeElement: { isStatic: true },
          elements,
          noSsr,
        });
      }
      return paths;
    },
    handleRoute: async (path, { query }) => {
      await configure();

      // path without slugs
      const routePath = getPageRoutePath(path);
      if (!routePath) {
        throw new Error('Route not found: ' + path);
      }

      const pageComponent =
        staticComponentMap.get(joinPath(routePath, 'page').slice(1)) ??
        dynamicPagePathMap.get(routePath)?.[1] ??
        wildcardPagePathMap.get(routePath)?.[1];

      if (!pageComponent) {
        throw new Error('Page not found: ' + path);
      }

      const pathSpec = parsePathWithSlug(routePath);
      const mapping = getPathMapping(pathSpec, path);
      const result: Record<string, ReactNode> = {
        [`page:${routePath}`]: createElement(
          pageComponent,
          { ...mapping, ...(query ? { query } : {}), path },
          createElement(Children),
        ),
      };

      const layoutPaths = getLayouts(
        getOriginalStaticPathSpec(path) ?? pathSpec,
      );

      for (const segment of layoutPaths) {
        const layout =
          dynamicLayoutPathMap.get(segment)?.[1] ??
          staticComponentMap.get(joinPath(segment, 'layout').slice(1)); // feels like a hack

        const isDynamic = !dynamicLayoutPathMap.has(segment);

        // always true
        if (layout) {
          const id = 'layout:' + segment;
          result[id] = createElement(
            layout,
            isDynamic ? { path } : null,
            createElement(Children),
          );
        }
      }

      // loop over all layouts for path
      const routeChildren = [
        ...layoutPaths.map((lPath) => ({
          component: Slot,
          props: { id: `layout:${lPath}` },
        })),
        { component: Slot, props: { id: `page:${routePath}` } },
      ];

      return {
        elements: result,
        rootElement: createElement(
          rootItem ? rootItem.component : DefaultRoot,
          null,
          createElement(Children),
        ),
        routeElement: createNestedElements(routeChildren),
      };
    },
    getApiConfig: async () => {
      await configure();

      return Array.from(apiPathMap.values()).map(({ pathSpec, mode }) => {
        return {
          path: pathSpec,
          isStatic: mode === 'static',
        };
      });
    },
    handleApi: async (path, options) => {
      await configure();
      const routePath = getApiRoutePath(path, options.method);
      if (!routePath) {
        throw new Error('API Route not found: ' + path);
      }
      const { handler } = apiPathMap.get(`${options.method} ${routePath}`)!;

      const req = new Request(
        new URL(
          path,
          // TODO consider if we should apply `Forwarded` header here
          'http://localhost',
        ),
        options,
      );
      const res = await handler(req);

      return {
        ...(res.body ? { body: res.body } : {}),
        headers: Object.fromEntries(res.headers.entries()),
        status: res.status,
      };
    },
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
};
