import type { PathWithoutSlug } from '../create-pages.js';
import type { Join, ReplaceAll, Split } from '../util-types.js';

type StaticSlugPage = {
  path: string;
  render: 'static';
  staticPaths: (string | string[])[];
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
  SplitPath extends string[],
  StaticSlugs extends string[],
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
  StaticPathSet extends string[],
> = StaticPathSet extends unknown
  ? Join<ReplaceHelper<Split<Path, '/'>, StaticPathSet>, '/'>
  : never;

/** staticPaths could be a string or a string[][]. This type acts as an if else to handle each type of staticPaths. */
type CollectPathsForStaticSlugPage<Page extends StaticSlugPage> = Page extends {
  path: infer Path extends string;
  render: 'static';
  staticPaths: infer StaticPaths extends string[] | string[][];
}
  ? StaticPaths extends string[]
    ? ReplaceSlugSet<Path, StaticPaths[number]>
    : StaticPaths extends string[][]
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
  staticPaths?: string[] | string[][];
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
export type PathsForPages<PagesResult extends { DO_NOT_USE_pages: AnyPage }> =
  CollectPaths<PagesResult['DO_NOT_USE_pages']> extends never
    ? string
    : CollectPaths<PagesResult['DO_NOT_USE_pages']> & {};
