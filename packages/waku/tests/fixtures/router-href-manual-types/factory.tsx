import type { TypeEqual } from 'ts-expect';
import { expectType } from 'ts-expect';
import { unstable_createRouteHref } from 'waku/router';
import type { CreatePagesConfig, SearchCodecsConfig } from 'waku/router';
import {
  Link,
  useRouter,
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from 'waku/router/client';

type Search = { page: number };

const product = unstable_createRouteHref({
  path: '/products/[id]',
  search: {
    parse: (query: string): Search => ({
      page: Number(new URLSearchParams(query).get('page')) || 1,
    }),
    serialize: (search: Search) => `page=${search.page}`,
  },
});
const paramsOnly = unstable_createRouteHref({ path: '/products/[id]' });
const docs = unstable_createRouteHref({ path: '/docs/[...parts]' });
const about = unstable_createRouteHref({ path: '/about' });
const unknown = unstable_createRouteHref({ path: '/unregistered/[id]' });
const article = unstable_createRouteHref({ path: '/articles/[slug]' });
const intro = unstable_createRouteHref({ path: '/articles/intro' });

expectType<TypeEqual<keyof CreatePagesConfig, never>>(true);
expectType<TypeEqual<keyof SearchCodecsConfig, never>>(true);
expectType<TypeEqual<typeof product.path, '/products/[id]'>>(true);

export const href = product({
  params: { id: '42' },
  search: { page: 2 },
  hash: 'price',
});
expectType<string>(href);
paramsOnly({ params: { id: '42' } });
docs({ params: { parts: ['api', 'reference'] as const } });
about({ hash: '#top' });

// @ts-expect-error local params remain required without generated page metadata
product({ search: { page: 2 } });
// @ts-expect-error local params reject unknown names
paramsOnly({ params: { slug: '42' } });
// @ts-expect-error local search remains typed without SearchCodecsConfig
product({ params: { id: '42' }, search: { page: '2' } });
// @ts-expect-error parameter-only factories reject search
paramsOnly({ params: { id: '42' }, search: { page: 2 } });
// @ts-expect-error static factories reject params
about({ params: { id: '42' } });
// @ts-expect-error catch-all params require an array
docs({ params: { parts: 'api/reference' } });

export function ManualFactoryNavigationProbe() {
  const router = useRouter();
  const search = useSearch_UNSTABLE(product);
  expectType<TypeEqual<typeof search, Search | null>>(true);
  expectType<Search | null>(search);
  const setSearch = useSetSearch_UNSTABLE(product);
  void setSearch({ page: 2 });
  void router.push(href);
  void router.replace(paramsOnly({ params: { id: '42' } }));
  router.prefetch(docs({ params: { parts: ['api', 'reference'] } }));
  const unknownHref = unknown({ params: { id: '42' } });
  void router.push(unknownHref);
  void router.replace(unknownHref);
  router.prefetch(unknownHref);
  void router.push(article({ params: { slug: 'not-built' } }));
  // @ts-expect-error raw hrefs remain constrained by RouteConfig
  void router.push('/unregistered/42');

  return (
    <>
      <Link to={href}>Product</Link>
      <Link to={about({ hash: 'top' })}>About</Link>
      <Link to={intro()}>Intro</Link>
      <Link to={article({ params: { slug: 'intro' } })}>Article</Link>
      <Link to={unknownHref}>Unknown</Link>
      {/* @ts-expect-error raw hrefs remain constrained by RouteConfig */}
      <Link to="/unregistered/42">Unknown Raw Href</Link>
    </>
  );
}
