import { describe, expect, test } from 'vitest';
import { buildRouteHref } from '../src/router/client-utils/build-route-href.js';

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

  test('serializes an object search', () => {
    expect(
      buildRouteHref({
        to: '/about',
        search: { page: '2', q: 'x', ok: 'true' },
      }),
    ).toBe('/about?page=2&q=x&ok=true');
  });

  test('omits undefined search and supports arrays', () => {
    expect(
      buildRouteHref({
        to: '/about',
        search: { a: undefined, tag: ['x', 'y'] },
      }),
    ).toBe('/about?tag=x&tag=y');
  });

  test('appends a hash with or without a leading #', () => {
    expect(buildRouteHref({ to: '/about', hash: 'top' })).toBe('/about#top');
    expect(buildRouteHref({ to: '/about', hash: '#top' })).toBe('/about#top');
  });

  test('combines params, search, and hash', () => {
    expect(
      buildRouteHref({
        to: '/posts/[slug]',
        params: { slug: 'hello' },
        search: { tab: 'comments' },
        hash: 'reply',
      }),
    ).toBe('/posts/hello?tab=comments#reply');
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
      buildRouteHref({ to: '/about', search: { page: '2', tags: ['a', 'b'] } });
      buildRouteHref({ to: '/about', search: { page: undefined } });
      // @ts-expect-error search values must be strings, not numbers
      buildRouteHref({ to: '/about', search: { page: 2 } });
      // @ts-expect-error search values are not nullable (use undefined to omit)
      buildRouteHref({ to: '/about', search: { page: null } });
      // @ts-expect-error search must be an object, not a query string
      buildRouteHref({ to: '/about', search: 'page=2' });
    };
    expect(typeof assertTypes).toBe('function');
  });
});
