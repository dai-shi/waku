import type { ComponentProps } from 'react';
import type { TypeEqual } from 'ts-expect';
import { expectType } from 'ts-expect';
import { unstable_createRouteHref } from 'waku/router';
import type { SearchCodecsConfig } from 'waku/router';
import {
  Link,
  useRouter,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from 'waku/router/client';
import { productSearchCodec as codec } from './search.js';
import type { Search } from './search.js';

type LinkTarget = ComponentProps<typeof Link>['to'];

const product = unstable_createRouteHref({
  path: '/products/[id]',
  search: codec,
});
const paramsOnly = unstable_createRouteHref({ path: '/products/[id]' });
const docs = unstable_createRouteHref({ path: '/docs/[...parts]' });
const profile = unstable_createRouteHref({ path: '/@[name]' });
const grouped = unstable_createRouteHref({
  path: '/(shop)/(catalog)/products/[id]',
});
const home = unstable_createRouteHref({ path: '/' });
const about = unstable_createRouteHref({ path: '/about', search: codec });
const unknown = unstable_createRouteHref({ path: '/unregistered/[id]' });
const localSearch = unstable_createRouteHref({
  path: '/products/[id]',
  search: {
    parse: (_query: string) => ({ sort: 'asc' as 'asc' | 'desc' }),
    serialize: (search: { sort: 'asc' | 'desc' }) => `sort=${search.sort}`,
  },
});

expectType<TypeEqual<keyof SearchCodecsConfig, '/products/[id]'>>(true);
expectType<TypeEqual<typeof product.path, '/products/[id]'>>(true);
expectType<TypeEqual<typeof product.searchCodec, typeof codec>>(true);
expectType<
  ReturnType<typeof unstable_createRouteHref<'/products/[id]', Search>>
>(product);
expectType<ReturnType<typeof unstable_createRouteHref<'/products/[id]'>>>(
  paramsOnly,
);
expectType<ReturnType<typeof paramsOnly>>(product({ params: { id: '42' } }));
expectType<ReturnType<typeof paramsOnly>>(grouped({ params: { id: '42' } }));
expectType<string>(unknown({ params: { id: '42' } }));
// @ts-expect-error raw strings do not carry construction provenance
expectType<ReturnType<typeof product>>('/products/42');
expectType<
  TypeEqual<Parameters<ReturnType<typeof useRouter>['push']>[0], LinkTarget>
>(true);

// @ts-expect-error an explicit search type requires a codec
unstable_createRouteHref<'/products/[id]', Search>({ path: '/products/[id]' });
expectType<
  TypeEqual<Parameters<ReturnType<typeof useRouter>['replace']>[0], LinkTarget>
>(true);
expectType<
  TypeEqual<Parameters<ReturnType<typeof useRouter>['prefetch']>[0], LinkTarget>
>(true);

export const href = product({
  params: { id: '42' },
  search: { page: 2, tag: 'new' },
  hash: '#price',
});
expectType<string>(href);
expectType<LinkTarget>(href);
product({ params: { id: '42' } });
paramsOnly({ params: { id: '42' }, hash: 'price' });
docs({ params: { parts: ['api', 'reference'] as const }, hash: 'top' });
profile({ params: { name: 'alice' } });
grouped({ params: { id: '42' } });
home({});
home();
about({ search: { page: 2, tag: '' }, hash: 'top' });
localSearch({ params: { id: '42' }, search: { sort: 'desc' } });

// @ts-expect-error path params are required
product({ search: { page: 2, tag: '' } });
// @ts-expect-error factories with params require an argument
product();
// @ts-expect-error path params are inferred from this pattern
product({ params: { slug: '42' } });
// @ts-expect-error slug params are strings
product({ params: { id: 42 } });
// @ts-expect-error unknown param keys are rejected
product({ params: { id: '42', slug: 'extra' } });
// @ts-expect-error search value types come from the local codec
product({ params: { id: '42' }, search: { page: '2', tag: '' } });
// @ts-expect-error required search keys cannot be omitted
product({ params: { id: '42' }, search: { page: 2 } });
// @ts-expect-error search is not taken from another factory with the same path
product({ params: { id: '42' }, search: { sort: 'asc' } });
// @ts-expect-error factories for the same path retain independent codec inference
localSearch({ params: { id: '42' }, search: { page: 2, tag: '' } });
// @ts-expect-error parameter-only factories do not accept search
paramsOnly({ params: { id: '42' }, search: { page: 2, tag: '' } });
// @ts-expect-error catch-all params are arrays
docs({ params: { parts: 'api/reference' } });
// @ts-expect-error catch-all members are strings
docs({ params: { parts: [1] } });
// @ts-expect-error static paths do not accept params
about({ params: { id: '42' } });
// @ts-expect-error hashes are strings
product({ params: { id: '42' }, hash: 1 });
// @ts-expect-error factory output is a primitive href, not a resolver target
href.resolve();

export function FactoryNavigationProbe() {
  const router = useRouter();
  void router.push(href);
  void router.replace(paramsOnly({ params: { id: '42' }, hash: 'price' }));
  router.prefetch(docs({ params: { parts: ['api', 'reference'] } }));
  const unknownHref = unknown({ params: { id: '42' }, hash: 'top' });
  // @ts-expect-error a factory does not assert membership in RouteConfig
  void router.push(unknownHref);
  // @ts-expect-error a factory does not assert membership in RouteConfig
  void router.replace(unknownHref);
  // @ts-expect-error a factory does not assert membership in RouteConfig
  router.prefetch(unknownHref);

  return (
    <>
      <Link to={href}>Product</Link>
      <Link to={grouped({ params: { id: '42' } })}>Grouped Product</Link>
      <Link to={profile({ params: { name: 'alice' } })}>Profile</Link>
      <Link to={home({ hash: 'top' })}>Home</Link>
      <Link to={about({ search: { page: 2, tag: '' }, hash: 'top' })}>
        About
      </Link>
      <Link to="/articles/intro#top">Intro</Link>
      {/* @ts-expect-error unknown factory paths are not registered hrefs */}
      <Link to={unknownHref}>Unknown</Link>
    </>
  );
}

export function FactorySearchProbe() {
  const search = useSearch_UNSTABLE(product);
  expectType<TypeEqual<typeof search, Search | null>>(true);
  expectType<Search | null>(search);
  const setSearch = useSetSearch_UNSTABLE(product);
  void setSearch({ page: 2 });
  void setSearch(
    (prev) => {
      expectType<TypeEqual<typeof prev, Search>>(true);
      return { page: prev.page + 1 };
    },
    { history: 'replace', scroll: true },
  );
  // @ts-expect-error search update values are inferred from the codec
  void setSearch({ page: '2' });
  // @ts-expect-error search updates reject unknown keys
  void setSearch({ sort: 'asc' });
  // @ts-expect-error parameter-only factories have no codec to parse search
  useSearch_UNSTABLE(paramsOnly);
  // @ts-expect-error parameter-only factories have no codec to update search
  useSetSearch_UNSTABLE(paramsOnly);
  const groupedSearch = unstable_createRouteHref({
    path: '/(shop)/(catalog)/products/[id]',
    search: codec,
  });
  expectType<Search | null>(useSearch_UNSTABLE(groupedSearch));
  useSetSearch_UNSTABLE(groupedSearch);
  expectType<Search | null>(
    useSearch_UNSTABLE({ path: '/products/[id]', searchCodec: codec }),
  );
  useSetSearch_UNSTABLE({ path: '/products/[id]', searchCodec: codec });
  const typo = unstable_createRouteHref({ path: '/serach', search: codec });
  // @ts-expect-error search readers reject unknown factory patterns
  useSearch_UNSTABLE(typo);
  // @ts-expect-error search setters reject unknown factory patterns
  useSetSearch_UNSTABLE(typo);
  // @ts-expect-error search readers reject unknown descriptor patterns
  useSearch_UNSTABLE({ path: '/serach', searchCodec: codec });
  // @ts-expect-error search setters reject unknown descriptor patterns
  useSetSearch_UNSTABLE({ path: '/serach', searchCodec: codec });
  return null;
}
