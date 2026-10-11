import { describe, expect, test } from 'vitest';
import { unstable_createRouteHref } from '../src/router/base-types.js';

type Search = { tab: string; page: number };

const codec = {
  parse: (query: string): Search => {
    const sp = new URLSearchParams(query);
    return { tab: sp.get('tab') ?? '', page: Number(sp.get('page')) || 1 };
  },
  serialize: (search: Search) =>
    new URLSearchParams({
      tab: search.tab,
      page: String(search.page),
    }).toString(),
};

const post = unstable_createRouteHref({ path: '/posts/[slug]' });
const docs = unstable_createRouteHref({ path: '/docs/[...path]' });
const about = unstable_createRouteHref({ path: '/about' });
const searchPage = unstable_createRouteHref({
  path: '/href-search',
  search: codec,
});

describe('route href construction', () => {
  test('static routes', () => {
    expect(unstable_createRouteHref({ path: '/' })()).toBe('/');
    expect(about()).toBe('/about');
  });

  test('fills a slug and URL-encodes the value', () => {
    expect(post({ params: { slug: 'hello' } })).toBe('/posts/hello');
    expect(post({ params: { slug: 'a b/c' } })).toBe('/posts/a%20b%2Fc');
  });

  test('fills a prefixed slug', () => {
    const profile = unstable_createRouteHref({ path: '/@[name]' });
    expect(profile({ params: { name: 'foo' } })).toBe('/@foo');
  });

  test('fills a catch-all', () => {
    expect(docs({ params: { path: ['a', 'b'] } })).toBe('/docs/a/b');
  });

  test('root catch-all allows an empty array', () => {
    const root = unstable_createRouteHref({ path: '/[...path]' });
    expect(root({ params: { path: [] } })).toBe('/');
  });

  test('prefixed catch-all rejects an empty array', () => {
    expect(() => docs({ params: { path: [] } })).toThrow();
  });

  test('removes route groups', () => {
    const marketing = unstable_createRouteHref({ path: '/(marketing)/about' });
    expect(marketing()).toBe('/about');
  });

  test('serializes search via the supplied codec', () => {
    expect(searchPage({ search: { tab: 'x', page: 2 } })).toBe(
      '/href-search?tab=x&page=2',
    );
  });

  test('throws when search is passed without a codec', () => {
    // @ts-expect-error a factory without a codec cannot accept search
    expect(() => about({ search: { a: '1' } })).toThrow(/no search codec/);
  });

  test('appends a hash with or without a leading #', () => {
    expect(about({ hash: 'top' })).toBe('/about#top');
    expect(about({ hash: '#top' })).toBe('/about#top');
  });

  test('combines params, search, and hash', () => {
    const page = unstable_createRouteHref({ path: '/p/[slug]', search: codec });
    expect(
      page({
        params: { slug: 'hello' },
        search: { tab: 'comments', page: 1 },
        hash: 'reply',
      }),
    ).toBe('/p/hello?tab=comments&page=1#reply');
  });

  test('throws on a missing param', () => {
    // @ts-expect-error params is required for a route with a slug
    expect(() => post()).toThrow();
  });
});

describe('route href factory types', () => {
  test('params are derived from the route pattern', () => {
    const assertTypes = () => {
      post({ params: { slug: 'a' } });
      docs({ params: { path: ['a', 'b'] } });
      about();
      // @ts-expect-error missing required slug param
      post({ params: {} });
      // @ts-expect-error a static route accepts no params
      about({ params: { slug: 'a' } });
      // @ts-expect-error unknown param name
      post({ params: { id: 'a' } });
    };
    expect(typeof assertTypes).toBe('function');
  });

  test('search is typed by the local codec', () => {
    const assertTypes = () => {
      searchPage({ search: { tab: 'x', page: 2 } });
      // @ts-expect-error search must match the codec's shape
      searchPage({ search: { tab: 'x' } });
      // @ts-expect-error a factory without a codec cannot pass search
      about({ search: { a: '1' } });
    };
    expect(typeof assertTypes).toBe('function');
  });
});
