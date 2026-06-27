import { describe, expect, test } from 'vitest';
import { buildRouteHref } from '../src/router/isomorphic-utils/build-route-href.js';
import { matchRouteParams } from '../src/router/isomorphic-utils/match-route-params.js';

describe('matchRouteParams', () => {
  test('matches a static route', () => {
    expect(matchRouteParams('/about', '/about')).toEqual({});
    expect(matchRouteParams('/about', '/posts')).toBeNull();
  });

  test('matches a slug', () => {
    expect(matchRouteParams('/posts/[slug]', '/posts/hello')).toEqual({
      slug: 'hello',
    });
  });

  test('returns null on mismatch', () => {
    expect(matchRouteParams('/posts/[slug]', '/about')).toBeNull();
    expect(matchRouteParams('/posts/[slug]', '/posts/a/b')).toBeNull();
  });

  test('URL-decodes matched values', () => {
    expect(matchRouteParams('/posts/[slug]', '/posts/a%20b%2Fc')).toEqual({
      slug: 'a b/c',
    });
  });

  test('returns null for malformed percent-encoding', () => {
    expect(matchRouteParams('/posts/[slug]', '/posts/%E0%A4%A')).toBeNull();
    expect(matchRouteParams('/docs/[...path]', '/docs/ok/%E0%A4%A')).toBeNull();
  });

  test('matches a prefixed slug', () => {
    expect(matchRouteParams('/@[name]', '/@foo')).toEqual({ name: 'foo' });
  });

  test('matches a catch-all and decodes each part', () => {
    expect(matchRouteParams('/docs/[...path]', '/docs/a/b')).toEqual({
      path: ['a', 'b'],
    });
    expect(matchRouteParams('/docs/[...path]', '/docs/a%20b/c')).toEqual({
      path: ['a b', 'c'],
    });
  });

  test('catch-all empty behavior matches the matcher', () => {
    expect(matchRouteParams('/[...path]', '/')).toEqual({ path: [] });
    expect(matchRouteParams('/docs/[...path]', '/docs')).toBeNull();
  });

  test('strips route groups', () => {
    expect(matchRouteParams('/(marketing)/about', '/about')).toEqual({});
    expect(
      matchRouteParams('/(marketing)/posts/[slug]', '/posts/hello'),
    ).toEqual({ slug: 'hello' });
  });

  test('round-trips with buildRouteHref', () => {
    const slugHref = buildRouteHref({
      to: '/posts/[slug]',
      params: { slug: 'a b/c' },
    }).split(/[?#]/, 1)[0]!;
    expect(matchRouteParams('/posts/[slug]', slugHref)).toEqual({
      slug: 'a b/c',
    });

    const catchAllHref = buildRouteHref({
      to: '/docs/[...path]',
      params: { path: ['a b', 'c'] },
    }).split(/[?#]/, 1)[0]!;
    expect(matchRouteParams('/docs/[...path]', catchAllHref)).toEqual({
      path: ['a b', 'c'],
    });
  });
});

describe('matchRouteParams types', () => {
  test('params are derived from the route pattern', () => {
    // Type-level assertions; the closure is never invoked.
    const assertTypes = () => {
      const slugParams = matchRouteParams('/posts/[slug]', '/posts/x');
      if (slugParams) {
        const slug: string = slugParams.slug;
        void slug;
        // @ts-expect-error unknown param name
        void slugParams.id;
      }
      const catchAllParams = matchRouteParams('/docs/[...path]', '/docs/x');
      if (catchAllParams) {
        const path: string[] = catchAllParams.path;
        void path;
      }
    };
    expect(typeof assertTypes).toBe('function');
  });
});
