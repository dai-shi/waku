import { createElement } from 'react';
import type { FunctionComponent, ReactElement, ReactNode } from 'react';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import {
  countSlugsAndWildcards,
  getPathMapping,
  joinPath,
  parseExactPath,
  parsePathWithSlug,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { Children, Slot } from '../minimal/client.js';
import { ErrorBoundary } from '../router/client.js';
import { pathnameToRoutePath } from './common-utils/route-path.js';
import type {
  AnyPage,
  GetSlugs,
  PropsForPages,
} from './create-pages-utils/inferred-path-types.js';
import { unstable_defineRouter } from './define-router.js';
import type { ApiHandler, HandlerInterceptor } from './define-router.js';

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
export const METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH',
] as const;
export type Method = (typeof METHODS)[number];

export const pathMappingWithoutGroups: typeof getPathMapping = (
  pathSpec,
  pathname,
) => {
  const cleanPathSpec = pathSpec.filter(
    (spec) => !(spec.type === 'literal' && spec.name.startsWith('(')),
  );
  return getPathMapping(cleanPathSpec, pathname);
};

const sanitizeSlug = (slug: string) => slug.replace(/ /g, '-');

const normalizeStaticPaths = (
  staticPaths: readonly (string | readonly string[])[],
): string[][] =>
  staticPaths.map((item) =>
    (Array.isArray(item) ? item : [item]).map(sanitizeSlug),
  );

const assertStaticPathArity = (
  staticSegments: readonly string[],
  slugCount: number,
  wildcardCount: number,
) => {
  if (staticSegments.length !== slugCount && wildcardCount === 0) {
    throw new Error('staticPaths does not match with slug pattern');
  }
};

const getPageSlotId = (routePath: string) => `page:${routePath}`;
const getLayoutSlotId = (layoutIdPath: string) => `layout:${layoutIdPath}`;

const forEachConcreteStaticPath = (
  routePathSpec: PathSpec,
  staticPathsInput: readonly (string | readonly string[])[],
  fn: (concrete: ReturnType<typeof expandStaticRoutePath>) => void,
) => {
  const { numSlugs, numWildcards } = countSlugsAndWildcards(routePathSpec);
  for (const staticSegments of normalizeStaticPaths(staticPathsInput)) {
    assertStaticPathArity(staticSegments, numSlugs, numWildcards);
    fn(expandStaticRoutePath(routePathSpec, staticSegments));
  }
};

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
export type HasSlugInPath<
  T,
  K extends string,
> = T extends `/${string}[${K}]${string}/${infer _Rest}`
  ? true
  : T extends `/${infer _}/${infer U}`
    ? HasSlugInPath<`/${U}`, K>
    : T extends `/${string}[${K}]${string}`
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

/**
 * Returns a `dynamic` slot's element tag (etag). While the tag is unchanged the
 * client reuses its cached element instead of receiving it again. Only consulted
 * for dynamic slots.
 *
 * - Opaque to Waku; compared with `===`.
 * - Must change whenever the rendered content would.
 * - Keep it a short ASCII string (a hash or version): the client echoes its
 *   tags in a header.
 * - Return `undefined` for no tag: the element is always sent, overriding the
 *   client's cache for the slot.
 */
type GetEtag<Props> = (props: Props) => Promise<string | undefined>;

export type CreatePage = <
  Path extends string,
  SlugKey extends string,
  WildSlugKey extends string,
  Render extends 'static' | 'dynamic',
  StaticPaths extends StaticSlugRoutePaths<Path>,
  ExactPath extends boolean | undefined = undefined,
  Slices extends string[] = [],
>(
  page: (
    | {
        render: Extract<Render, 'static'>;
        path: PathWithoutSlug<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      }
    | ({
        render: Extract<Render, 'static'>;
        path: PathWithStaticSlugs<Path>;
        component: FunctionComponent<PropsForPages<Path>>;
      } & (ExactPath extends true ? {} : { staticPaths: StaticPaths }))
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
    | {
        component: null; // For build-time pruning
      }
  ) & {
    unstable_disableSSR?: boolean;
    /**
     * If true, the path will be matched exactly, without wildcards or slugs.
     * This is intended for extending support to create custom routers.
     */
    exactPath?: ExactPath;
    /**
     * List of slice ids used in the component.
     * This is _required_ to send the slices along with the component.
     */
    slices?: Slices;
    /**
     * Source file path of the page module, relative to `<rootDir>/<srcDir>`
     * (e.g. `pages/foo.tsx`). When set, the framework can prune the module's
     * chunks from the runtime server bundle if the route is fully static.
     */
    unstable_sourceFile?: string | undefined;
    /**
     * Per-render element tag (etag) for a `dynamic` page. Ignored for `static`
     * pages.
     */
    unstable_getEtag?: GetEtag<PropsForPages<Path>>;
  },
) => Omit<
  Extract<
    Exclude<typeof page, { path: never } | { render: never }>,
    { render: 'static' | 'dynamic' }
  >,
  'unstable_disableSSR'
>;

export type CreateLayout = <Path extends string>(
  layout: (
    | {
        render: 'dynamic';
        path: Path;
        component: FunctionComponent<
          { children: ReactNode } & Omit<PropsForPages<Path>, 'path' | 'query'>
        >;
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'static';
        path: Path;
        component: FunctionComponent<
          { children: ReactNode } & Omit<PropsForPages<Path>, 'path' | 'query'>
        >;
        unstable_sourceFile?: string | undefined;
      }
    | {
        component: null; // For build-time pruning
      }
  ) & {
    /**
     * Per-render element tag (etag) for a `dynamic` layout. Ignored for `static`
     * layouts.
     */
    unstable_getEtag?: GetEtag<Omit<PropsForPages<Path>, 'path' | 'query'>>;
  },
) => void;

export type CreateApi = <Path extends string>(
  params:
    | {
        render: 'static';
        path: Path;
        method: 'GET';
        handler: ApiHandler;
        staticPaths?: (string | string[])[] | undefined;
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'dynamic';
        path: Path;
        /**
         * Handlers by named method. Use `all` to handle all methods.
         * Named methods will take precedence over `all`.
         */
        handlers: Partial<Record<Method | 'all', ApiHandler>>;
        unstable_sourceFile?: string | undefined;
      }
    | {
        render: 'static';
        handler: null; // For build-time pruning
      }
    | {
        render: 'dynamic';
        handlers: null; // For build-time pruning
      },
) => void;

type SlugPropsFromId<ID extends string> =
  GetSlugs<`/${ID}`> extends never[]
    ? {}
    : GetSlugs<`/${ID}`> extends string[]
      ? { [K in GetSlugs<`/${ID}`>[number]]: string }
      : {};

export type CreateSlice = <
  ID extends string,
  StaticPaths extends StaticSlugRoutePaths<`/${ID}`>,
>(
  slice: (
    | {
        render: 'dynamic';
        id: ID;
        component: FunctionComponent<
          { children: ReactNode } & SlugPropsFromId<ID>
        >;
        unstable_sourceFile?: string | undefined;
      }
    | {
        // Static slice without a slug in its id.
        render: 'static';
        id: PathWithoutSlug<`/${ID}`> extends never ? never : ID;
        component: FunctionComponent<{ children: ReactNode }>;
        unstable_sourceFile?: string | undefined;
      }
    | {
        // Static slice with a slug — staticPaths is required and
        // enumerates the concrete slug values to pre-build.
        render: 'static';
        id: PathWithStaticSlugs<`/${ID}`> extends never ? never : ID;
        component: FunctionComponent<
          { children: ReactNode } & SlugPropsFromId<ID>
        >;
        staticPaths: StaticPaths;
        unstable_sourceFile?: string | undefined;
      }
    | {
        component: null; // For build-time pruning
      }
  ) & {
    /**
     * Per-render element tag (etag) for a `dynamic` slice. Ignored for `static`
     * slices.
     */
    unstable_getEtag?: GetEtag<SlugPropsFromId<ID>>;
  },
) => void;

type RootItem = {
  render: 'static' | 'dynamic';
  component: FunctionComponent<{ children: ReactNode }>;
  unstable_sourceFile?: string | undefined;
  /**
   * Per-render element tag (etag) for a `dynamic` root. Ignored for a `static`
   * root. The root takes no props, so the getter is parameterless.
   */
  unstable_getEtag?: () => Promise<string | undefined>;
};

export type CreateRoot = (
  root:
    | RootItem
    | {
        component: null; // For build-time pruning
      },
) => void;

export type CreateInterceptor = (interceptor: HandlerInterceptor) => void;

/**
 * Root component for all pages
 * ```tsx
 *   <html>
 *     <head></head>
 *     <body>{children}</body>
 *   </html>
 * ```
 */
const DefaultRoot = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <html>
      <head />
      <body>{children}</body>
    </html>
  </ErrorBoundary>
);

const createNestedElements = (
  elements: {
    component: FunctionComponent<any>;
    props?: Record<string, unknown>;
  }[],
  children: ReactElement,
): ReactElement =>
  elements.reduceRight(
    (result, element) =>
      createElement(element.component, element.props, result),
    children,
  );

const routePriorityComparator = (
  a: {
    path: PathSpec;
    type: 'route' | 'api';
  },
  b: {
    path: PathSpec;
    type: 'route' | 'api';
  },
) => {
  const aPath = a.path;
  const bPath = b.path;
  const aPathLength = aPath.length;
  const bPathLength = bPath.length;
  const aHasWildcard = aPath.at(-1)?.type === 'wildcard';
  const bHasWildcard = bPath.at(-1)?.type === 'wildcard';

  // Special case: root route (length 0) should come before wildcard routes
  // This ensures exact matches like "/" are checked before catch-all routes like "/[...notFound]"
  if (aPathLength === 0 && bHasWildcard) {
    return -1;
  }
  if (bPathLength === 0 && aHasWildcard) {
    return 1;
  }

  // Compare path lengths first (longer paths are more specific)
  if (aPathLength !== bPathLength) {
    return aPathLength > bPathLength ? -1 : 1;
  }

  // If path lengths are equal, literal segments take priority over dynamic segments
  const minLength = Math.min(aPathLength, bPathLength);
  for (let i = 0; i < minLength; i++) {
    const aIsLiteral = aPath[i]?.type === 'literal';
    const bIsLiteral = bPath[i]?.type === 'literal';
    if (aIsLiteral !== bIsLiteral) {
      return aIsLiteral ? -1 : 1;
    }
  }

  // If path lengths are equal, compare wildcard presence
  // sort the route without the wildcard higher, to check it earlier
  if (aHasWildcard !== bHasWildcard) {
    return aHasWildcard ? 1 : -1;
  }

  // If all else is equal, routes have the same priority
  return 0;
};

export const createPages = <
  AllPages extends (AnyPage | ReturnType<CreateLayout>)[],
>(
  fn: (fns: {
    createPage: CreatePage;
    createLayout: CreateLayout;
    createRoot: CreateRoot;
    createApi: CreateApi;
    createSlice: CreateSlice;
    createInterceptor: CreateInterceptor;
  }) => Promise<AllPages>,
  options?: {
    unstable_skipBuild?: (routePath: string) => boolean;
  },
) => {
  let configured = false;

  // layout lookups retain (group) path and pathMaps store without group
  // paths are stored without groups to easily detect duplicates
  const groupedRoutePathByRoutePath = new Map<string, string>();
  const staticPageEntryByRoutePath = new Map<
    string,
    {
      concretePathSpec: PathSpec;
      pathPatternSpec?: PathSpec;
      noSsr: boolean;
      sourceFile?: string | undefined;
    }
  >();
  type DynamicPageEntry<Props = any> = {
    routePathSpec: PathSpec;
    component: FunctionComponent<Props>;
    noSsr: boolean;
    sourceFile?: string | undefined;
    getEtag?: GetEtag<Props> | undefined;
  };
  type LayoutEntry<Props = any> = {
    routePathSpec: PathSpec;
    component: FunctionComponent<{ children: ReactNode } & Props>;
    sourceFile?: string | undefined;
    getEtag?: GetEtag<Props> | undefined;
  };
  const dynamicPageEntryByRoutePath = new Map<string, DynamicPageEntry>();
  const wildcardPageEntryByRoutePath = new Map<string, DynamicPageEntry>();
  const dynamicLayoutEntryByRoutePath = new Map<string, LayoutEntry>();
  const apiEntryByRoutePath = new Map<
    string,
    {
      render: 'static' | 'dynamic';
      routePathSpec: PathSpec;
      handlers: Partial<Record<Method | 'all', ApiHandler>>;
      staticParams?: Record<string, string | string[]>;
      sourceFile?: string | undefined;
    }
  >();
  const staticComponentById = new Map<
    string,
    { component: FunctionComponent<any>; sourceFile?: string | undefined }
  >();
  const getStaticComponentId = (routePath: string, kind: 'page' | 'layout') =>
    joinPath(routePath, kind).slice(1);
  const getStaticLayout = (id: string) =>
    staticComponentById.get(getStaticComponentId(id, 'layout'))?.component;
  const sliceIdsByRoutePath = new Map<string, string[]>();
  type SliceEntry<Props = any> = {
    component: FunctionComponent<{ children?: ReactNode } & Props>;
    isStatic: boolean;
    sourceFile?: string | undefined;
    getEtag?: GetEtag<Props> | undefined;
  };
  const sliceEntryById = new Map<string, SliceEntry>();
  let rootItem: RootItem | undefined = undefined;

  const pagePathExists = (path: string) =>
    apiEntryByRoutePath.has(path) ||
    staticPageEntryByRoutePath.has(path) ||
    dynamicPageEntryByRoutePath.has(path) ||
    wildcardPageEntryByRoutePath.has(path);

  /** Creates a function to map pathname to component props */
  const createPathPropsMapper = (path: string) => {
    const layoutMatchPath = groupedRoutePathByRoutePath.get(path) ?? path;
    const routePathSpec = parsePathWithSlug(layoutMatchPath);
    return (pathname: string) =>
      pathMappingWithoutGroups(routePathSpec, pathname);
  };

  const createLayoutPropsMapper = (layoutPath: string) => {
    const routePathSpec = parsePathWithSlug(layoutPath);
    const numSegments = routePathSpec.filter(
      (segment) =>
        !(segment.type === 'literal' && segment.name.startsWith('(')),
    ).length;
    return (routePath: string) => {
      const layoutRoutePath =
        '/' +
        routePath.split('/').filter(Boolean).slice(0, numSegments).join('/');
      return pathMappingWithoutGroups(routePathSpec, layoutRoutePath) ?? {};
    };
  };

  const getLayoutIdPath = (layoutPath: string, routePath: string): string => {
    const numSegments = parsePathWithSlug(layoutPath).length;
    return (
      '/' + routePath.split('/').filter(Boolean).slice(0, numSegments).join('/')
    );
  };

  /** Builds the routeElement renderer from layouts and page slots */
  const buildRouteElement = (
    layouts: { layoutPath: string; layoutIdPath: string }[],
    path: string,
  ) => {
    const layoutElements = layouts.map(({ layoutIdPath }) => ({
      component: Slot,
      props: { id: getLayoutSlotId(layoutIdPath) },
    }));
    return () =>
      createNestedElements(layoutElements, <Slot id={getPageSlotId(path)} />);
  };

  /** Renders the root component */
  const renderRoot = () =>
    createElement(
      rootItem ? rootItem.component : DefaultRoot,
      null,
      <Children />,
    );

  const registerStaticComponent = (
    id: string,
    component: FunctionComponent<any>,
    sourceFile?: string,
  ) => {
    const existing = staticComponentById.get(id);
    if (existing && existing.component !== component) {
      throw new Error(`Duplicated component for: ${id}`);
    }
    staticComponentById.set(id, { component, sourceFile });
  };

  const isAllElementsStatic = (
    elements: Record<string, { isStatic?: boolean }>,
  ) => Object.values(elements).every((element) => element.isStatic);

  const isAllSlicesStatic = (path: string) =>
    sliceIdsByRoutePath
      .get(path)!
      .every((sliceId) => sliceEntryById.get(sliceId)?.isStatic);

  const createPage: CreatePage = (page) => {
    if (configured) {
      throw new Error('createPage no longer available');
    }
    if (!page.component) {
      return page as Extract<
        Exclude<typeof page, { path: never } | { render: never }>,
        { render: 'static' | 'dynamic' }
      >;
    }
    const pageRoutePath = pathnameToRoutePath(page.path);
    if (pagePathExists(pageRoutePath)) {
      throw new Error(`Duplicated path: ${page.path}`);
    }

    const routePathSpec = parsePathWithSlug(pageRoutePath);
    const { numSlugs, numWildcards } = countSlugsAndWildcards(routePathSpec);
    const noSsr = page.unstable_disableSSR ?? false;
    const slices = page.slices || [];
    const sourceFile = page.unstable_sourceFile;
    const getEtag = page.unstable_getEtag;

    const registerPageWithExactPath = () => {
      const routePath = pageRoutePath;
      const spec = parseExactPath(routePath);
      if (page.render === 'static') {
        staticPageEntryByRoutePath.set(routePath, {
          concretePathSpec: spec,
          noSsr,
          sourceFile,
        });
        const id = getStaticComponentId(routePath, 'page');
        registerStaticComponent(id, page.component, sourceFile);
      } else {
        dynamicPageEntryByRoutePath.set(routePath, {
          routePathSpec: spec,
          component: page.component,
          noSsr,
          sourceFile,
          getEtag,
        });
      }
      sliceIdsByRoutePath.set(routePath, slices);
    };

    const registerStaticPageWithoutSlugs = () => {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      staticPageEntryByRoutePath.set(routePath, {
        concretePathSpec: routePathSpec,
        noSsr,
        sourceFile,
      });
      const id = getStaticComponentId(routePath, 'page');
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      registerStaticComponent(id, page.component, sourceFile);
      sliceIdsByRoutePath.set(routePath, slices);
    };

    const registerStaticPageWithSlugs = (
      staticPathsInput: readonly (string | readonly string[])[],
    ) => {
      forEachConcreteStaticPath(
        routePathSpec,
        staticPathsInput,
        ({ concretePath, pathItems, mapping }) => {
          const routePath = pathnameToRoutePath(getGrouplessPath(concretePath));
          const concretePathSpec: PathSpec = pathItems.map((name) => ({
            type: 'literal',
            name,
          }));
          staticPageEntryByRoutePath.set(routePath, {
            concretePathSpec,
            pathPatternSpec: routePathSpec,
            noSsr,
            sourceFile,
          });
          const concreteRoutePath = pathnameToRoutePath(concretePath);
          if (routePath !== concreteRoutePath) {
            groupedRoutePathByRoutePath.set(routePath, concreteRoutePath);
          }
          const id = getStaticComponentId(routePath, 'page');
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(page.component as never, { ...props, ...mapping });
          registerStaticComponent(id, WrappedComponent, sourceFile);
          sliceIdsByRoutePath.set(routePath, slices);
        },
      );
    };

    const registerDynamicPageWithoutWildcard = () => {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      dynamicPageEntryByRoutePath.set(routePath, {
        routePathSpec,
        component: page.component,
        noSsr,
        sourceFile,
        getEtag,
      });
      sliceIdsByRoutePath.set(routePath, slices);
    };

    const registerDynamicPageWithWildcard = () => {
      const routePath = pathnameToRoutePath(getGrouplessPath(page.path));
      if (routePath !== pageRoutePath) {
        groupedRoutePathByRoutePath.set(routePath, pageRoutePath);
      }
      wildcardPageEntryByRoutePath.set(routePath, {
        routePathSpec,
        component: page.component,
        noSsr,
        sourceFile,
        getEtag,
      });
      sliceIdsByRoutePath.set(routePath, slices);
    };

    if (page.exactPath) {
      registerPageWithExactPath();
    } else if (page.render === 'static' && numSlugs === 0) {
      registerStaticPageWithoutSlugs();
    } else if (
      page.render === 'static' &&
      numSlugs > 0 &&
      'staticPaths' in page
    ) {
      registerStaticPageWithSlugs(page.staticPaths);
    } else if (page.render === 'dynamic' && numWildcards === 0) {
      registerDynamicPageWithoutWildcard();
    } else if (page.render === 'dynamic' && numWildcards === 1) {
      registerDynamicPageWithWildcard();
    } else {
      throw new Error('Invalid page configuration ' + JSON.stringify(page));
    }
    return page as Exclude<typeof page, { path: never } | { render: never }>;
  };

  const createLayout: CreateLayout = (layout) => {
    if (configured) {
      throw new Error('createLayout no longer available');
    }
    if (!layout.component) {
      return;
    }
    const routePath = pathnameToRoutePath(layout.path);
    const sourceFile = layout.unstable_sourceFile;
    const getEtag = layout.unstable_getEtag;
    if (layout.render === 'static') {
      const id = getStaticComponentId(routePath, 'layout');
      registerStaticComponent(id, layout.component, sourceFile);
    } else if (layout.render === 'dynamic') {
      if (dynamicLayoutEntryByRoutePath.has(routePath)) {
        throw new Error(`Duplicated dynamic path: ${layout.path}`);
      }
      const routePathSpec = parsePathWithSlug(routePath);
      dynamicLayoutEntryByRoutePath.set(routePath, {
        routePathSpec,
        component: layout.component,
        sourceFile,
        getEtag,
      });
    } else {
      throw new Error('Invalid layout configuration');
    }
  };

  const createApi: CreateApi = (options) => {
    if (configured) {
      throw new Error('createApi no longer available');
    }
    if (options.render === 'static') {
      if (!options.handler) {
        return;
      }
    } else {
      if (!options.handlers || !Object.values(options.handlers).some(Boolean)) {
        return;
      }
    }
    const routePath = pathnameToRoutePath(options.path);
    const sourceFile = options.unstable_sourceFile;
    if (pagePathExists(routePath)) {
      throw new Error(`Duplicated api path: ${options.path}`);
    }
    const routePathSpec = parsePathWithSlug(routePath);
    if (options.render === 'static') {
      const { numSlugs } = countSlugsAndWildcards(routePathSpec);
      if (numSlugs > 0 && options.staticPaths) {
        forEachConcreteStaticPath(
          routePathSpec,
          options.staticPaths,
          ({ concretePath, pathItems, mapping }) => {
            const concreteRoutePath = pathnameToRoutePath(concretePath);
            if (pagePathExists(concreteRoutePath)) {
              throw new Error(`Duplicated api path: ${concretePath}`);
            }
            apiEntryByRoutePath.set(concreteRoutePath, {
              render: 'static',
              routePathSpec: pathItems.map((name) => ({
                type: 'literal',
                name,
              })),
              handlers: { GET: options.handler },
              staticParams: mapping,
              sourceFile,
            });
          },
        );
      } else {
        apiEntryByRoutePath.set(routePath, {
          render: 'static',
          routePathSpec,
          handlers: { GET: options.handler },
          sourceFile,
        });
      }
    } else {
      apiEntryByRoutePath.set(routePath, {
        render: 'dynamic',
        routePathSpec,
        handlers: options.handlers,
        sourceFile,
      });
    }
  };

  const createRoot: CreateRoot = (root) => {
    if (configured) {
      throw new Error('createRoot no longer available');
    }
    if (!root.component) {
      return;
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

  const createSlice: CreateSlice = (slice) => {
    if (configured) {
      throw new Error('createSlice no longer available');
    }
    if (!slice.component) {
      return;
    }
    const slicePathSpec = parsePathWithSlug(slice.id);
    const { numSlugs } = countSlugsAndWildcards(slicePathSpec);
    const sourceFile = slice.unstable_sourceFile;
    const getEtag = slice.unstable_getEtag;
    if (slice.render === 'static' && numSlugs > 0) {
      if (!('staticPaths' in slice) || !slice.staticPaths) {
        throw new Error(
          `Static slice with slug requires staticPaths: ${slice.id}`,
        );
      }
      forEachConcreteStaticPath(
        slicePathSpec,
        slice.staticPaths,
        ({ concretePath, mapping }) => {
          const concreteId = concretePath.replace(/^\//, '');
          if (sliceEntryById.has(concreteId)) {
            throw new Error(`Duplicated slice id: ${concreteId}`);
          }
          const WrappedComponent = (props: Record<string, unknown>) =>
            createElement(slice.component as never, { ...props, ...mapping });
          sliceEntryById.set(concreteId, {
            component: WrappedComponent,
            isStatic: true,
            sourceFile,
          });
        },
      );
      return;
    }
    if (sliceEntryById.has(slice.id)) {
      throw new Error(`Duplicated slice id: ${slice.id}`);
    }
    sliceEntryById.set(slice.id, {
      component: slice.component,
      isStatic: slice.render === 'static',
      sourceFile,
      getEtag,
    });
  };

  const interceptors: HandlerInterceptor[] = [];
  const createInterceptor: CreateInterceptor = (interceptor) => {
    if (configured) {
      throw new Error('createInterceptor no longer available');
    }
    interceptors.push(interceptor);
  };

  let ready: Promise<AllPages | void> | undefined;
  const configure = async () => {
    if (!configured && !ready) {
      ready = fn({
        createPage,
        createLayout,
        createRoot,
        createApi,
        createSlice,
        createInterceptor,
      });
      await ready;

      configured = true;
    }
    await ready;
  };

  const getLayouts = (routePathSpec: PathSpec): string[] => {
    const pathSegments = routePathSpec.reduce<string[]>(
      (acc, _segment, index) => {
        acc.push(pathSpecAsString(routePathSpec.slice(0, index + 1)));
        return acc;
      },
      ['/'],
    );

    return pathSegments.filter(
      (segment) =>
        dynamicLayoutEntryByRoutePath.has(segment) || getStaticLayout(segment),
    );
  };

  const definedRouter = unstable_defineRouter({
    getConfigs: async () => {
      await configure();
      type RendererOption = { routePath: string; query: string | undefined };
      type ElementSpec = {
        isStatic: boolean;
        renderer: (option: RendererOption) => ReactNode;
        sourceFile?: string;
        getEtagFromOption?: (
          option: RendererOption,
        ) => Promise<string | undefined>;
      };
      type LayoutMatch = { layoutPath: string; layoutIdPath: string };
      const collectLayoutMatches = (
        spec: PathSpec,
        routePath?: string,
      ): LayoutMatch[] =>
        getLayouts(spec).map((layoutPath) => ({
          layoutPath,
          layoutIdPath: routePath
            ? getLayoutIdPath(layoutPath, routePath)
            : layoutPath,
        }));
      // Memoize so component and getEtag get the same props reference.
      const buildElementSpec = <Props,>(
        component: FunctionComponent<Props>,
        buildProps: (option: RendererOption) => Props,
        isStatic: boolean,
        sourceFile: string | undefined,
        getEtag: GetEtag<Props> | undefined,
      ): ElementSpec => {
        const propsCache = new WeakMap<RendererOption, Props>();
        const toProps = (option: RendererOption): Props => {
          if (!propsCache.has(option)) {
            propsCache.set(option, buildProps(option));
          }
          return propsCache.get(option)!;
        };
        return {
          isStatic,
          renderer: (option) =>
            createElement(
              component as FunctionComponent<any>,
              toProps(option),
              <Children />,
            ),
          ...(sourceFile ? { sourceFile } : {}),
          ...(getEtag
            ? { getEtagFromOption: (option) => getEtag(toProps(option)) }
            : {}),
        };
      };
      const buildLayoutElement = (layoutPath: string): ElementSpec => {
        const dynamicEntry = dynamicLayoutEntryByRoutePath.get(layoutPath);
        const staticEntry = dynamicEntry
          ? undefined
          : staticComponentById.get(getStaticComponentId(layoutPath, 'layout'));
        const layout = dynamicEntry?.component ?? staticEntry?.component;
        if (!layout) {
          throw new Error('Invalid layout ' + layoutPath);
        }
        const sourceFile = dynamicEntry?.sourceFile ?? staticEntry?.sourceFile;
        const getLayoutPropsMapping = createLayoutPropsMapper(layoutPath);
        return buildElementSpec(
          layout,
          (option) => getLayoutPropsMapping(option.routePath),
          !dynamicEntry,
          sourceFile,
          dynamicEntry?.getEtag,
        );
      };
      const buildLayoutElements = (
        matches: LayoutMatch[],
      ): Record<string, ElementSpec> =>
        Object.fromEntries(
          matches.map(({ layoutPath, layoutIdPath }) => [
            getLayoutSlotId(layoutIdPath),
            buildLayoutElement(layoutPath),
          ]),
        );
      const buildPageElement = <Props,>(
        component: FunctionComponent<Props>,
        getPropsMapping: (routePath: string) => Record<string, unknown> | null,
        isStatic: boolean,
        sourceFile?: string,
        getEtag?: GetEtag<Props>,
      ): ElementSpec =>
        buildElementSpec(
          component,
          (option) =>
            ({
              ...getPropsMapping(option.routePath),
              ...(option.query ? { query: option.query } : {}),
              path: option.routePath,
            }) as unknown as Props,
          isStatic,
          sourceFile,
          getEtag,
        );
      const rootIsStatic = !rootItem || rootItem.render === 'static';
      const rootSourceFile = rootItem?.unstable_sourceFile;
      const rootGetEtag = rootItem?.unstable_getEtag;
      const buildRootElement = (): ElementSpec => ({
        isStatic: rootIsStatic,
        renderer: renderRoot,
        ...(rootSourceFile ? { sourceFile: rootSourceFile } : {}),
        ...(rootGetEtag ? { getEtagFromOption: () => rootGetEtag() } : {}),
      });
      const buildRouteConfigBase = (
        routePath: string,
        pathSpec: PathSpec,
        layouts: LayoutMatch[],
        elements: Record<string, ElementSpec>,
        noSsr: boolean,
      ) => ({
        type: 'route' as const,
        path: pathSpec.filter((part) => !part.name?.startsWith('(')),
        isStatic:
          rootIsStatic &&
          isAllElementsStatic(elements) &&
          isAllSlicesStatic(routePath),
        rootElement: buildRootElement(),
        routeElement: {
          isStatic: true,
          renderer: buildRouteElement(layouts, routePath),
        },
        elements,
        noSsr,
        slices: sliceIdsByRoutePath.get(routePath)!,
      });
      const buildStaticRouteConfigs = () =>
        Array.from(
          staticPageEntryByRoutePath,
          ([routePath, { concretePathSpec, pathPatternSpec, noSsr }]) => {
            const groupedRoutePath =
              groupedRoutePathByRoutePath.get(routePath) ?? routePath;
            const layouts = collectLayoutMatches(
              pathPatternSpec ?? concretePathSpec,
              groupedRoutePath,
            );
            const pageEntry = staticComponentById.get(
              getStaticComponentId(routePath, 'page'),
            )!;
            const getPropsMapping = createPathPropsMapper(routePath);
            const elements: Record<string, ElementSpec> =
              buildLayoutElements(layouts);
            elements[getPageSlotId(routePath)] = buildPageElement(
              pageEntry.component,
              getPropsMapping,
              true,
              pageEntry.sourceFile,
            );
            return {
              ...buildRouteConfigBase(
                routePath,
                concretePathSpec,
                layouts,
                elements,
                noSsr,
              ),
              ...(pathPatternSpec && { pathPattern: pathPatternSpec }),
            };
          },
        );
      const buildDynamicLikeRouteConfig = (
        routePath: string,
        {
          routePathSpec,
          component,
          noSsr,
          sourceFile,
          getEtag,
        }: DynamicPageEntry,
      ) => {
        const layouts = collectLayoutMatches(routePathSpec);
        const getPropsMapping = createPathPropsMapper(routePath);
        const elements: Record<string, ElementSpec> =
          buildLayoutElements(layouts);
        elements[getPageSlotId(routePath)] = buildPageElement(
          component,
          getPropsMapping,
          false,
          sourceFile,
          getEtag,
        );
        return buildRouteConfigBase(
          routePath,
          routePathSpec,
          layouts,
          elements,
          noSsr,
        );
      };
      const buildDynamicRouteConfigs = () =>
        Array.from(dynamicPageEntryByRoutePath, ([routePath, entry]) =>
          buildDynamicLikeRouteConfig(routePath, entry),
        );
      const buildWildcardRouteConfigs = () =>
        Array.from(wildcardPageEntryByRoutePath, ([routePath, entry]) =>
          buildDynamicLikeRouteConfig(routePath, entry),
        );
      const buildApiConfigs = () =>
        Array.from(
          apiEntryByRoutePath.values(),
          ({ routePathSpec, render, handlers, staticParams, sourceFile }) => ({
            type: 'api' as const,
            path: routePathSpec,
            isStatic: render === 'static',
            handler: async (
              req: Request,
              apiContext: Parameters<ApiHandler>[1],
            ) => {
              const path = new URL(req.url).pathname;
              const method = req.method;
              const handler = handlers[method as Method] ?? handlers.all;
              if (!handler) {
                throw new Error(
                  'API method not found: ' + method + 'for path: ' + path,
                );
              }
              return handler(
                req,
                staticParams ? { params: staticParams } : apiContext,
              );
            },
            ...(sourceFile ? { sourceFile } : {}),
          }),
        );
      const buildSliceConfigs = () =>
        Array.from(
          sliceEntryById,
          ([id, { isStatic, sourceFile, getEtag }]) => {
            const slicePathSpec = parsePathWithSlug(id);
            const hasSlug = slicePathSpec.some((s) => s.type !== 'literal');
            return {
              type: 'slice' as const,
              id,
              ...(hasSlug ? { pathSpec: slicePathSpec } : {}),
              isStatic,
              renderer: async (params?: Record<string, string | string[]>) => {
                const slice = sliceEntryById.get(id);
                if (!slice) {
                  throw new Error('Slice not found: ' + id);
                }
                return createElement(slice.component, params, <Children />);
              },
              ...(sourceFile ? { sourceFile } : {}),
              ...(getEtag ? { getEtagFromParams: getEtag } : {}),
            };
          },
        );

      const routeConfigs = [
        ...buildStaticRouteConfigs(),
        ...buildDynamicRouteConfigs(),
        ...buildWildcardRouteConfigs(),
      ];
      const pathConfigs = [...routeConfigs, ...buildApiConfigs()]
        // Sort routes by priority: "standard routes" -> api routes -> api wildcard routes -> standard wildcard routes
        .sort((configA, configB) => routePriorityComparator(configA, configB));
      return [...pathConfigs, ...buildSliceConfigs()];
    },
    ...(options?.unstable_skipBuild && {
      unstable_skipBuild: options.unstable_skipBuild,
    }),
    unstable_interceptors: interceptors,
  });

  return definedRouter as typeof definedRouter & {
    /** This for type inference of the router only. We do not actually return anything for this type. */
    DO_NOT_USE_pages: Exclude<
      Exclude<Awaited<Exclude<typeof ready, undefined>>, void>[number],
      void // createLayout returns void
    >;
  };
};

function expandStaticRoutePath(
  routePathSpec: PathSpec,
  staticSegments: readonly string[],
) {
  const mapping: Record<string, string | string[]> = {};
  let slugIndex = 0;
  const pathItems: string[] = [];
  routePathSpec.forEach((spec) => {
    switch (spec.type) {
      case 'literal':
        pathItems.push(spec.name!);
        break;
      case 'wildcard':
        mapping[spec.name!] = staticSegments.slice(slugIndex);
        staticSegments.slice(slugIndex++).forEach((slug) => {
          pathItems.push(slug);
        });
        break;
      case 'group': {
        const slug = staticSegments[slugIndex++]!;
        const prefix = spec.prefix ?? '';
        const suffix = spec.suffix ?? '';
        pathItems.push(`${prefix}${slug}${suffix}`);
        mapping[spec.name!] = slug;
        break;
      }
    }
  });
  const concretePath = '/' + pathItems.join('/');
  return {
    concretePath,
    pathItems,
    mapping,
  };
}
