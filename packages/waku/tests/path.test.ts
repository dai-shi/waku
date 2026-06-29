import { describe, expect, test } from 'vitest';
import { extname, removeBase } from '../src/lib/utils/path.js';
import { path2regexp } from '../src/router/define-router-utils/path-spec.js';
import {
  getPathMapping,
  parsePathWithSlug,
} from '../src/router/isomorphic-utils/path-spec.js';

function matchPath(path: string, input: string) {
  return new RegExp(path2regexp(parsePathWithSlug(path))).test(input);
}

describe('extname', () => {
  test('returns the extension of a path', () => {
    expect(extname('foo/bar/baz.js')).toBe('.js');
    expect(extname('foo/bar/baz')).toBe('');
    expect(extname('foo/bar/.baz')).toBe('');
    expect(extname('foo/bar/..baz')).toBe('');
  });
});

describe('path2regexp', () => {
  test('handles paths without slugs', () => {
    expect(matchPath('/foo/bar', '/foo/bar')).toBe(true);
    expect(matchPath('/foo/baz', '/foo/bar')).toBe(false);
  });

  test('handles paths with groups', () => {
    expect(matchPath('/foo/[x]/[y]', '/foo/bar/baz')).toBe(true);
    expect(matchPath('/foo/[x]/[y]', '/foo/baz/bar')).toBe(true);
    expect(matchPath('/bar/[x]/[y]', '/foo/bar')).toBe(false);
    expect(matchPath('/foo/[x]/[y]', '/foo/bar/baz/qux')).toBe(false);
  });

  test('handles paths with wildcards', () => {
    expect(matchPath('/foo/[...x]', '/foo/bar/baz/qux')).toBe(true);
    expect(matchPath('/foo/[...x]', '/foo/bar')).toBe(true);
    expect(matchPath('/foo/[...x]', '/foo')).toBe(false);
    expect(matchPath('/foo/[...x]', '/bar')).toBe(false);
  });

  test('handles paths with groups and wildcards', () => {
    expect(matchPath('/foo/[x]/[...y]', '/foo/bar/baz/qux')).toBe(true);
    expect(matchPath('/foo/[x]/[...y]', '/foo/bar')).toBe(false);
    expect(matchPath('/foo/[x]/[...y]', '/foo')).toBe(false);
    expect(matchPath('/foo/[x]/[...y]', '/bar')).toBe(false);
  });

  test('handles paths with prefixed groups', () => {
    expect(matchPath('/@[username]', '/@alice')).toBe(true);
    expect(matchPath('/@[username]', '/alice')).toBe(false);
    expect(matchPath('/u-[id]', '/u-123')).toBe(true);
    expect(matchPath('/u-[id]', '/123')).toBe(false);
    expect(matchPath('/[id]-profile', '/123-profile')).toBe(true);
    expect(matchPath('/[id]-profile', '/123')).toBe(false);
    expect(matchPath('/pre-[id]-suf', '/pre-123-suf')).toBe(true);
    expect(matchPath('/pre-[id]-suf', '/pre-123')).toBe(false);
  });

  test('treats regex metacharacters in literals as literal characters', () => {
    expect(matchPath('/file.txt', '/file.txt')).toBe(true);
    expect(matchPath('/file.txt', '/fileAtxt')).toBe(false);
    expect(matchPath('/a+b', '/a+b')).toBe(true);
    expect(matchPath('/a+b', '/aab')).toBe(false);
    expect(matchPath('/(group)', '/(group)')).toBe(true);
    expect(matchPath('/(group)', '/group')).toBe(false);
  });
});

describe('parsePathWithSlug', () => {
  test('parses plain segments as literals', () => {
    expect(parsePathWithSlug('/foo/bar')).toEqual([
      { type: 'literal', name: 'foo' },
      { type: 'literal', name: 'bar' },
    ]);
  });

  test('parses [param] as group', () => {
    expect(parsePathWithSlug('/foo/[id]')).toEqual([
      { type: 'literal', name: 'foo' },
      { type: 'group', name: 'id' },
    ]);
  });

  test('parses prefixed slug @[username]', () => {
    expect(parsePathWithSlug('/@[username]')).toEqual([
      { type: 'group', name: 'username', prefix: '@' },
    ]);
  });

  test('parses prefixed slug u-[id]', () => {
    expect(parsePathWithSlug('/u-[id]')).toEqual([
      { type: 'group', name: 'id', prefix: 'u-' },
    ]);
  });

  test('parses suffixed slug [id]-profile', () => {
    expect(parsePathWithSlug('/[id]-profile')).toEqual([
      { type: 'group', name: 'id', suffix: '-profile' },
    ]);
  });

  test('parses prefix and suffix pre-[id]-suf', () => {
    expect(parsePathWithSlug('/pre-[id]-suf')).toEqual([
      { type: 'group', name: 'id', prefix: 'pre-', suffix: '-suf' },
    ]);
  });

  test('parses [...path] as wildcard', () => {
    expect(parsePathWithSlug('/foo/[...path]')).toEqual([
      { type: 'literal', name: 'foo' },
      { type: 'wildcard', name: 'path' },
    ]);
  });
});

describe('getPathMapping', () => {
  test('handles literal paths', () => {
    const pathSpec = parsePathWithSlug('/foo/bar');
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({});
    expect(getPathMapping(pathSpec, '/foo/bar/')).toEqual({});
    expect(getPathMapping(pathSpec, '/foo/baz')).toBe(null);
  });

  test('handles paths with groups', () => {
    const pathSpec = parsePathWithSlug('/foo/[id]');
    expect(getPathMapping(pathSpec, '/foo/123')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/foo/123/')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({ id: 'bar' });
    expect(getPathMapping(pathSpec, '/foo')).toBe(null);
  });

  test('handles paths with wildcards', () => {
    const pathSpec = parsePathWithSlug('/foo/[...path]');
    expect(getPathMapping(pathSpec, '/foo/bar/baz')).toEqual({
      path: ['bar', 'baz'],
    });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({ path: ['bar'] });
    expect(getPathMapping(pathSpec, '/foo')).toBe(null);
  });

  test('handles wildcard at root level matching index route', () => {
    const pathSpec = parsePathWithSlug('/[...catchAll]');
    expect(getPathMapping(pathSpec, '/')).toEqual({ catchAll: [] });
    expect(getPathMapping(pathSpec, '/foo')).toEqual({ catchAll: ['foo'] });
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({
      catchAll: ['foo', 'bar'],
    });
  });

  test('handles wildcard with prefix matching index', () => {
    const pathSpec = parsePathWithSlug('/prefix/[...path]');
    expect(getPathMapping(pathSpec, '/prefix')).toBe(null);
    expect(getPathMapping(pathSpec, '/prefix/foo')).toEqual({ path: ['foo'] });
  });

  test('handles non-terminal wildcard matching zero segments', () => {
    const pathSpec = parsePathWithSlug('/[...locale]/about');
    expect(getPathMapping(pathSpec, '/about')).toEqual({ locale: [] });
    expect(getPathMapping(pathSpec, '/zh/about')).toEqual({ locale: ['zh'] });
    expect(getPathMapping(pathSpec, '/zh/cn/about')).toEqual({
      locale: ['zh', 'cn'],
    });
    expect(getPathMapping(pathSpec, '/')).toBe(null);
    expect(getPathMapping(pathSpec, '/zh')).toBe(null);
  });

  test('handles non-terminal wildcard with multiple trailing literals', () => {
    const pathSpec = parsePathWithSlug('/[...wild]/foo/bar');
    expect(getPathMapping(pathSpec, '/foo/bar')).toEqual({ wild: [] });
    expect(getPathMapping(pathSpec, '/a/foo/bar')).toEqual({ wild: ['a'] });
    expect(getPathMapping(pathSpec, '/a/b/foo/bar')).toEqual({
      wild: ['a', 'b'],
    });
    expect(getPathMapping(pathSpec, '/bar')).toBe(null);
    expect(getPathMapping(pathSpec, '/foo')).toBe(null);
  });

  test('handles non-terminal wildcard with leading and trailing literals', () => {
    const pathSpec = parsePathWithSlug('/prefix/[...wild]/suffix');
    expect(getPathMapping(pathSpec, '/prefix/suffix')).toEqual({ wild: [] });
    expect(getPathMapping(pathSpec, '/prefix/a/suffix')).toEqual({
      wild: ['a'],
    });
    expect(getPathMapping(pathSpec, '/prefix/a/b/suffix')).toEqual({
      wild: ['a', 'b'],
    });
    expect(getPathMapping(pathSpec, '/prefix')).toBe(null);
    expect(getPathMapping(pathSpec, '/suffix')).toBe(null);
  });

  test('handles paths with prefixed groups', () => {
    const pathSpec = parsePathWithSlug('/@[username]');
    expect(getPathMapping(pathSpec, '/@john')).toEqual({
      username: 'john',
    });
    expect(getPathMapping(pathSpec, '/@')).toBe(null);
    expect(getPathMapping(pathSpec, '/john')).toBe(null);
  });

  test('handles paths with prefix and suffix groups', () => {
    const pathSpec = parsePathWithSlug('/pre-[id]-suf');
    expect(getPathMapping(pathSpec, '/pre-123-suf')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/pre--suf')).toBe(null);
    expect(getPathMapping(pathSpec, '/pre-123')).toBe(null);
    expect(getPathMapping(pathSpec, '/123-suf')).toBe(null);
  });

  test('handles paths with suffixed groups', () => {
    const pathSpec = parsePathWithSlug('/[id]-profile');
    expect(getPathMapping(pathSpec, '/123-profile')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/123')).toBe(null);
  });

  test('handles prefixed groups mixed with literal segments', () => {
    const pathSpec = parsePathWithSlug('/users/@[username]/posts');
    expect(getPathMapping(pathSpec, '/users/@john/posts')).toEqual({
      username: 'john',
    });
    expect(getPathMapping(pathSpec, '/users/john/posts')).toBe(null);
  });

  test('matches slug slice ID pattern', () => {
    const pathSpec = parsePathWithSlug('tooltip/[id]');
    expect(getPathMapping(pathSpec, '/tooltip/123')).toEqual({ id: '123' });
    expect(getPathMapping(pathSpec, '/tooltip')).toBe(null);
    expect(getPathMapping(pathSpec, '/other/123')).toBe(null);
  });

  test('matches multi-segment slug slice ID pattern', () => {
    const pathSpec = parsePathWithSlug('items/[cat]/[id]');
    expect(getPathMapping(pathSpec, '/items/books/42')).toEqual({
      cat: 'books',
      id: '42',
    });
    expect(getPathMapping(pathSpec, '/items/books')).toBe(null);
  });
});

describe('removeBase', () => {
  test('returns url unchanged when base is /', () => {
    expect(removeBase('/foo/bar', '/')).toBe('/foo/bar');
    expect(removeBase('/', '/')).toBe('/');
  });

  test('removes base from url when url starts with base', () => {
    expect(removeBase('/custom/base/foo', '/custom/base/')).toBe('/foo');
    expect(removeBase('/custom/base/', '/custom/base/')).toBe('/');
    expect(removeBase('/app/page', '/app/')).toBe('/page');
  });

  test('throws error when url does not start with base', () => {
    expect(() => removeBase('/other/path', '/custom/base/')).toThrow(
      'pathname must start with basePath',
    );
  });
});
