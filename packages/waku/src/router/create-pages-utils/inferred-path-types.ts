import type { RouteProps } from '../common.js';
import type { PathWithoutSlug } from '../create-pages.js';
import type { Join, ReplaceAll, Split, Prettify } from '../util-types.js';

type ReadOnlyStringTupleList = readonly (readonly string[])[];

type StaticSlugPage = {
  path: string;
  render: 'static';
  staticPaths: readonly string[] | ReadOnlyStringTupleList;
};

type DynamicPage = {
  path: string;
  render: 'dynamic';
};

type IsPageWithSlug<Page extends AnyPage> = Page extends {
  path: infer P;
}
  ? P extends PathWithoutSlug<P>
    ? false
    : true
  : never;

/** Used to replace a single slug param [mySlug] with a union of possible slugs 'foo' | 'bar' */
type ReplaceSlugSet<
  Path extends string,
  Slugs extends string,
> = Slugs extends unknown ? ReplaceAll<Path, `[${string}]`, Slugs> : never;

/**
 * This will replace slugs in the path with each entry to a string[][] passed to staticPaths.
 *
 * For example, if the path is `/foo/[...slug]` and the staticPaths is [['a', 'b'], ['c']],
 * the result will be `/foo/a/b` | `/foo/c`.
 *
 * And if the path is `/foo/[slug1]/[slug2]` and the staticPaths is [['a', 'b'], ['c', 'd']],
 * the result will be `/foo/a/b` | `/foo/c/d`.
 */
type ReplaceHelper<
  SplitPath extends readonly string[],
  StaticSlugs extends readonly string[],
  // SlugCountArr is a counter for the number of slugs added to result so far
  SlugCountArr extends null[] = [],
  Result extends string[] = [],
> = SplitPath extends [
  infer PathPart extends string,
  ...infer Rest extends string[],
]
  ? PathPart extends `[...${string}]`
    ? [...Result, ...StaticSlugs] // Wildcard always comes last
    : PathPart extends `[${string}]`
      ? ReplaceHelper<
          Rest,
          StaticSlugs,
          [...SlugCountArr, null],
          [...Result, StaticSlugs[SlugCountArr['length']]]
        >
      : ReplaceHelper<Rest, StaticSlugs, SlugCountArr, [...Result, PathPart]>
  : Result;

/**
 * Entry point to ReplaceHelper that Splits the path to start and Joins the final result.
 * This also loops over each possible StaticPathSet for when staticPaths is a string[][].
 * The looping is done by `StaticPathSet extends unknown`.
 */
type ReplaceTupleStaticPaths<
  Path extends string,
  StaticPathSet extends readonly string[],
> = StaticPathSet extends unknown
  ? Join<ReplaceHelper<Split<Path, '/'>, StaticPathSet>, '/'>
  : never;

/** staticPaths could be a string or a string[][]. This type acts as an if else to handle each type of staticPaths. */
type CollectPathsForStaticSlugPage<Page extends StaticSlugPage> = Page extends {
  path: infer Path extends string;
  render: 'static';
  staticPaths: infer StaticPaths extends
    | readonly string[]
    | ReadOnlyStringTupleList;
}
  ? StaticPaths extends readonly string[]
    ? ReplaceSlugSet<Path, StaticPaths[number]>
    : StaticPaths extends ReadOnlyStringTupleList
      ? ReplaceTupleStaticPaths<Path, StaticPaths[number]>
      : never
  : never;

/** Simply replace all slugs with any string for dynamic pages.*/
type CollectPathsForDynamicSlugPage<Page extends DynamicPage> = Page extends {
  path: infer Path extends string;
}
  ? ReplaceAll<Path, `[${string}]`, string>
  : never;

/**
 * CollectPaths takes each page of type AnyPage and maps over them to get the paths for that page.
 *
 * You can consider this the entry point to each of the page => path mappings.
 *
 * - Pages with no slugs will return the path as is.
 * - Static pages with slugs will return the path with the slugs replaced with the staticPaths.
 * - Dynamic pages with slugs will return the path with the slugs replaced with any string.
 *   (e.g., `/[slug]` => `/${string}`)
 */
export type CollectPaths<EachPage extends AnyPage> = EachPage extends unknown
  ? IsPageWithSlug<EachPage> extends true
    ? EachPage extends StaticSlugPage
      ? CollectPathsForStaticSlugPage<EachPage>
      : EachPage extends DynamicPage
        ? CollectPathsForDynamicSlugPage<EachPage>
        : never
    : EachPage['path']
  : never;

/** Generic type that represents any page. This is used to infer the return type of createPages. */
export type AnyPage = {
  path: string;
  render: 'static' | 'dynamic';
  staticPaths?: readonly string[] | readonly (readonly string[])[];
};

/**
 * PathsForPages will take the response of createPages and return the paths for all user defined pages.
 *
 * @example
 * const pages = createPages(async ({ createPage }) => [
 *   createPage({
 *     render: 'static',
 *     path: '/foo',
 *     component: Foo,
 *   }),
 *   createPage({
 *     render: 'static',
 *     path: '/bar',
 *     component: Bar,
 *   }),
 * ]);
 *
 * type MyPaths = PathsForPages<typeof pages>;
 * // type MyPaths = '/foo' | '/bar';
 */
export type PathsForPages<
  PagesResult extends { DO_NOT_USE_pages: AnyPage } | AnyPage,
> = PagesResult extends { DO_NOT_USE_pages: AnyPage }
  ? CollectPaths<PagesResult['DO_NOT_USE_pages']> extends never
    ? string
    : CollectPaths<PagesResult['DO_NOT_USE_pages']>
  : PagesResult extends AnyPage
    ? CollectPaths<PagesResult> extends never
      ? string
      : CollectPaths<PagesResult>
    : never;

type _GetSlugs<
  Route extends string,
  SplitRoute extends string[] = Split<Route, '/'>,
  Result extends string[] = [],
> = SplitRoute extends []
  ? Result
  : SplitRoute extends [`${infer MaybeSlug}`, ...infer Rest extends string[]]
    ? MaybeSlug extends `[${infer Slug}]`
      ? _GetSlugs<Route, Rest, [...Result, Slug]>
      : _GetSlugs<Route, Rest, Result>
    : Result;

export type GetSlugs<Route extends string> = _GetSlugs<Route>;

/** Paths with slugs as string literals */
export type PagePath<Config> = Config extends {
  pages: { path: infer Path };
}
  ? Path
  : never;

type IndividualSlugType<Slug extends string> = Slug extends `...${string}`
  ? string[]
  : string;

type CleanWildcard<Slug extends string> = Slug extends `...${infer Wildcard}`
  ? Wildcard
  : Slug;

type SlugTypes<Path extends string> =
  GetSlugs<Path> extends string[]
    ? {
        [Slug in GetSlugs<Path>[number] as CleanWildcard<Slug>]: IndividualSlugType<Slug>;
      }
    : never;

export type PropsForPages<Path extends string> = Prettify<
  Omit<RouteProps<ReplaceAll<Path, `[${string}]`, string>>, 'hash'> &
    SlugTypes<Path>
>;

type GetResponseType<Response extends { render: string }> =
  string extends Response['render'] ? { render: 'dynamic' } : Response;

/**
 * Helper used for generation of types with fs-router for
 * collecting the type of the getConfig function response and
 * falling back to {render: 'dynamic'} if inference fails.
 */
export type GetConfigResponse<
  Fn extends () => Promise<{ render: string }> | { render: string },
> =
  ReturnType<Fn> extends { render: string }
    ? GetResponseType<ReturnType<Fn>>
    : GetResponseType<Awaited<ReturnType<Fn>>>;
