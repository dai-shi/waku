import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import {
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from '../../../src/router/client-core-utils/search.js';
import { Link, useRouter } from '../../../src/router/client.js';
import { unstable_createRouteHref } from '../../../src/router/href-factory.js';

type Search = { page: number; tag: string };

const codec = {
  parse: (query: string): Search => ({
    page: Number(new URLSearchParams(query).get('page')) || 1,
    tag: new URLSearchParams(query).get('tag') ?? '',
  }),
  serialize: (search: Search) =>
    new URLSearchParams({
      page: String(search.page),
      tag: search.tag,
    }).toString(),
};

const product = unstable_createRouteHref({
  path: '/products/[id]',
  search: codec,
});
const docs = unstable_createRouteHref({
  path: '/docs/[...parts]',
  search: codec,
});
const home = unstable_createRouteHref({ path: '/', search: codec });
const post = unstable_createRouteHref({ path: '/posts/[id]' });
post({ params: { id: '42' } });
const grouped = unstable_createRouteHref({ path: '/(site)//about/(details)/' });
const about = unstable_createRouteHref({ path: '/about' });
expectType<ReturnType<typeof about>>(grouped({}));
expectType<ReturnType<typeof grouped>>(about());
const middle = unstable_createRouteHref({ path: '/docs/[...parts]/overview' });
expectType<string>(middle({ params: { parts: [] } }));
// @ts-expect-error parameter-only factories cannot accept search
post({ params: { id: '42' }, search: { page: 2, tag: '' } });
const other = unstable_createRouteHref({
  path: '/products/[id]',
  search: {
    parse: (_query: string) => ({ sort: 'asc' as 'asc' | 'desc' }),
    serialize: (search: { sort: 'asc' | 'desc' }) => `sort=${search.sort}`,
  },
});

expectType<TypeEqual<typeof product.path, '/products/[id]'>>(true);
expectType<string>(product({ params: { id: '42' } }));
product({ params: { id: '42' }, search: { page: 2, tag: '' } });
product({ params: { id: '42' } });
docs({ params: { parts: ['a', 'b'] as const } });
home({});
other({ params: { id: '42' }, search: { sort: 'desc' } });

// @ts-expect-error required path params cannot be omitted
product({ search: { page: 2, tag: '' } });
// @ts-expect-error path params are inferred locally
product({ params: { slug: '42' } });
// @ts-expect-error slugs must be strings
product({ params: { id: 42 } });
// @ts-expect-error search comes from this codec, not the route's name
product({ params: { id: '42' }, search: { sort: 'asc' } });
// @ts-expect-error search fields retain their value types
product({ params: { id: '42' }, search: { page: '2', tag: '' } });
// @ts-expect-error static paths do not accept params
home({ params: { id: '42' } });
// @ts-expect-error catch-all params must be arrays
docs({ params: { parts: 'a/b' } });
// @ts-expect-error two codecs on the same path retain independent inference
other({ params: { id: '42' }, search: { page: 2, tag: '' } });

export function TypeProbe() {
  // @ts-expect-error typed search hooks require a codec
  useSearch_UNSTABLE(post);
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
  // @ts-expect-error partial updates retain value types
  void setSearch({ page: '2' });
  // @ts-expect-error unknown search keys cannot be updated
  void setSearch({ sort: 'asc' });
  const router = useRouter();
  const target = product({
    params: { id: '42' },
    search: { page: 2, tag: '' },
  });
  void router.push(target);
  void router.replace(target);
  router.prefetch(target);
  return <Link to={target}>Product</Link>;
}
