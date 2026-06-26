import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import { buildRouteHref } from '../src/router/client-utils/build-route-href.js';
import type {
  PropsForPages,
  RouteSearch,
} from '../src/router/create-pages-utils/inferred-path-types.js';

type Search = { page: number; nested: { a: string } };

// A codec defined exactly as a user would: a plain object + `as const`.
const typedSearchCodec = {
  id: 'typed-search',
  parse: (query: string): Search => ({
    page: Number(new URLSearchParams(query).get('page')) || 1,
    nested: { a: new URLSearchParams(query).get('a') ?? '' },
  }),
  serialize: (search: Search) =>
    new URLSearchParams({
      page: String(search.page),
      a: search.nested.a,
    }).toString(),
} as const;

// Registry populated from the codec's type (a hand-kept registry, or fs-router
// typegen). A unique pattern avoids colliding with other tests.
declare module '../src/router/base-types.js' {
  interface SearchCodecsConfig {
    '/typed-search/[id]': typeof typedSearchCodec;
  }
}

describe('search params type foundation', () => {
  it('an `as const` codec drives lookup, props.search, and push.search', () => {
    // 1. lookup — Search extracted from the `as const` (readonly + literal id) codec
    expectType<TypeEqual<RouteSearch<'/typed-search/[id]'>, Search>>(true);
    expectType<TypeEqual<RouteSearch<'/no-codec'>, never>>(true);

    // 2. props.search: a codec route's PropsForPages gains a typed `search`
    type Props = PropsForPages<'/typed-search/[id]'>;
    expectType<TypeEqual<Props['search'], Search>>(true);
    expectType<TypeEqual<Props['id'], string>>(true);
    // a codec-less route has no `search` key at all
    type Plain = PropsForPages<'/plain/[id]'>;
    expectType<TypeEqual<'search' extends keyof Plain ? true : false, false>>(
      true,
    );

    // 3. push.search typed by `to`
    const assertPush = () => {
      buildRouteHref({
        to: '/typed-search/[id]',
        params: { id: 'x' },
        search: { page: 2, nested: { a: 'y' } },
      });
      buildRouteHref({
        to: '/typed-search/[id]',
        params: { id: 'x' },
        // @ts-expect-error search must match the route's codec
        search: { page: 'two' },
      });
      buildRouteHref({
        to: '/no-codec',
        // @ts-expect-error a route without a codec cannot pass search
        search: { page: 2 },
      });
    };
    expect(typeof assertPush).toBe('function');

    // runtime: the same codec round-trips
    expect(typedSearchCodec.parse('page=2&a=x')).toEqual({
      page: 2,
      nested: { a: 'x' },
    });
    expect(
      typedSearchCodec.serialize({ page: 2, nested: { a: 'x' } }),
    ).toContain('page=2');
  });
});
