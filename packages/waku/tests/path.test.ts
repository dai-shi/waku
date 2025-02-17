import { test, describe, expect } from 'vitest';
import {
  extname,
  parsePathWithSlug,
  path2regexp,
} from '../src/lib/utils/path.js';

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
});
