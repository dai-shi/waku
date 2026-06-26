import { describe, expect, test } from 'vitest';
import { buildRouteHref } from '../src/router/client-utils/build-route-href.js';

type Search = { tab: string; page: number };

const codec = {
  id: 'href-test',
  parse: (query: string): Search => {
    const sp = new URLSearchParams(query);
    return { tab: sp.get('tab') ?? '', page: Number(sp.get('page')) || 1 };
  },
  serialize: (search: Search) =>
    new URLSearchParams({
      tab: search.tab,
      page: String(search.page),
    }).toString(),
} as const;

declare module '../src/router/base-types.js' {
  interface SearchCodecsConfig {
    '/href-search': typeof codec;
    '/p/[slug]': typeof codec;
  }
}

// A codec resolver, as push/Link build it from <Unstable_SearchCodecsProvider>.
const resolveCodec = (routePath: string) =>
  routePath === '/href-search' || routePath === '/p/[slug]' ? codec : undefined;

describe('buildRouteHref', () => {
  test('static routes', () => {
    expect(buildRouteHref({ to: '/' })).toBe('/');
    expect(buildRouteHref({ to: '/about' })).toBe('/about');
  });

  test('fills a slug and URL-encodes the value', () => {
    expect(
      buildRouteHref({ to: '/posts/[slug]', params: { slug: 'hello' } }),
    ).toBe('/posts/hello');
    expect(
      buildRouteHref({ to: '/posts/[slug]', params: { slug: 'a b/c' } }),
    ).toBe('/posts/a%20b%2Fc');
  });

  test('fills a prefixed slug', () => {
    expect(buildRouteHref({ to: '/@[name]', params: { name: 'foo' } })).toBe(
      '/@foo',
    );
  });

  test('fills a catch-all', () => {
    expect(
      buildRouteHref({ to: '/docs/[...path]', params: { path: ['a', 'b'] } }),
    ).toBe('/docs/a/b');
  });

  test('root catch-all allows an empty array (matches "/")', () => {
    expect(buildRouteHref({ to: '/[...path]', params: { path: [] } })).toBe(
      '/',
    );
  });

  test('prefixed catch-all rejects an empty array (matches the matcher)', () => {
    expect(() =>
      buildRouteHref({ to: '/docs/[...path]', params: { path: [] } }),
    ).toThrow();
  });

  test('removes route groups', () => {
    expect(buildRouteHref({ to: '/(marketing)/about' })).toBe('/about');
  });

  test('serializes search via the resolved codec', () => {
    expect(
      buildRouteHref(
        { to: '/href-search', search: { tab: 'x', page: 2 } },
        resolveCodec,
      ),
    ).toBe('/href-search?tab=x&page=2');
  });

  test('throws when search is passed but no codec resolves', () => {
    expect(() =>
      buildRouteHref(
        {
          to: '/about',
          // @ts-expect-error a route without a codec cannot pass search
          search: { a: '1' },
        },
        resolveCodec,
      ),
    ).toThrow(/no search codec/);
  });

  test('appends a hash with or without a leading #', () => {
    expect(buildRouteHref({ to: '/about', hash: 'top' })).toBe('/about#top');
    expect(buildRouteHref({ to: '/about', hash: '#top' })).toBe('/about#top');
  });

  test('combines params, search, and hash', () => {
    expect(
      buildRouteHref(
        {
          to: '/p/[slug]',
          params: { slug: 'hello' },
          search: { tab: 'comments', page: 1 },
          hash: 'reply',
        },
        resolveCodec,
      ),
    ).toBe('/p/hello?tab=comments&page=1#reply');
  });

  test('throws on a missing param', () => {
    // @ts-expect-error params is required for a route with a slug
    expect(() => buildRouteHref({ to: '/posts/[slug]' })).toThrow();
  });
});

describe('buildRouteHref types', () => {
  test('params are derived from the route pattern', () => {
    // Type-level assertions; the closure is never invoked, so the invalid
    // calls do not run.
    const assertTypes = () => {
      buildRouteHref({ to: '/posts/[slug]', params: { slug: 'a' } });
      buildRouteHref({ to: '/docs/[...path]', params: { path: ['a', 'b'] } });
      buildRouteHref({ to: '/about' });
      // @ts-expect-error missing required slug param
      buildRouteHref({ to: '/posts/[slug]', params: {} });
      // @ts-expect-error a static route accepts no params
      buildRouteHref({ to: '/about', params: { slug: 'a' } });
      // @ts-expect-error unknown param name
      buildRouteHref({ to: '/posts/[slug]', params: { id: 'a' } });
    };
    expect(typeof assertTypes).toBe('function');
  });

  test('search is typed by the route codec', () => {
    const assertTypes = () => {
      buildRouteHref({ to: '/href-search', search: { tab: 'x', page: 2 } });
      buildRouteHref({
        to: '/href-search',
        // @ts-expect-error search must match the codec's shape
        search: { tab: 'x' },
      });
      buildRouteHref({
        to: '/about',
        // @ts-expect-error a route without a codec cannot pass search
        search: { a: '1' },
      });
    };
    expect(typeof assertTypes).toBe('function');
  });
});
