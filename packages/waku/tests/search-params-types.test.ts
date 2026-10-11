import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it, vi } from 'vitest';
import { unstable_createRouteHref } from '../src/router/base-types.js';
import type {
  PropsForPages,
  RouteSearch,
} from '../src/router/create-pages-utils/inferred-path-types.js';
import { unstable_redirect } from '../src/router/define-router.js';

// define-router pulls in server.js (react-server-dom-webpack); mock it so this
// pure type/codec test loads without the `react-server` condition.
vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

type Search = { page: number; nested: { a: string } };

const typedSearchCodec = {
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

declare module '../src/router/base-types.js' {
  interface SearchCodecsConfig {
    '/typed-search/[id]': typeof typedSearchCodec;
  }
}

describe('search params type foundation', () => {
  it('a shared codec types server props and local href construction', () => {
    expectType<TypeEqual<RouteSearch<'/typed-search/[id]'>, Search>>(true);
    expectType<TypeEqual<RouteSearch<'/no-codec'>, never>>(true);

    type Props = PropsForPages<'/typed-search/[id]'>;
    expectType<TypeEqual<Props['search'], Search>>(true);
    expectType<TypeEqual<Props['id'], string>>(true);
    type Plain = PropsForPages<'/plain/[id]'>;
    expectType<TypeEqual<'search' extends keyof Plain ? true : false, false>>(
      true,
    );

    const typed = unstable_createRouteHref({
      path: '/typed-search/[id]',
      search: typedSearchCodec,
    });
    const plain = unstable_createRouteHref({ path: '/no-codec' });
    const assertPush = () => {
      typed({
        params: { id: 'x' },
        search: { page: 2, nested: { a: 'y' } },
      });
      typed({
        params: { id: 'x' },
        // @ts-expect-error search must match the route's codec
        search: { page: 'two' },
      });
      plain({
        // @ts-expect-error a route without a codec cannot pass search
        search: { page: 2 },
      });
    };
    expect(typeof assertPush).toBe('function');

    const assertRedirect = [
      () =>
        unstable_redirect(
          typed({
            params: { id: 'x' },
            search: { page: 2, nested: { a: 'y' } },
          }),
        ),
      () =>
        unstable_redirect(
          typed({
            params: { id: 'x' },
            // @ts-expect-error search must match the route's codec
            search: { page: 'two' },
          }),
        ),
      () =>
        unstable_redirect(
          plain({
            // @ts-expect-error a route without a codec cannot pass search
            search: { page: 2 },
          }),
        ),
      () => unstable_redirect('/no-codec'),
    ];
    expect(assertRedirect).toHaveLength(4);

    expect(
      typed({
        params: { id: 'a b/c' },
        search: { page: 2, nested: { a: 'x' } },
      }),
    ).toBe('/typed-search/a%20b%2Fc?page=2&a=x');

    expect(typedSearchCodec.parse('page=2&a=x')).toEqual({
      page: 2,
      nested: { a: 'x' },
    });
    expect(
      typedSearchCodec.serialize({ page: 2, nested: { a: 'x' } }),
    ).toContain('page=2');
  });
});
