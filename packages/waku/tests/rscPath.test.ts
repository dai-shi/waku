import { describe, expect, test } from 'vitest';
import {
  decodeFuncId,
  decodeRscPath,
  encodeFuncId,
  encodeRscPath,
} from '../src/lib/utils/rsc-path.js';
import {
  decodeRoutePath,
  encodeRoutePath,
  pathnameToRoutePath,
} from '../src/router/isomorphic-utils/route-path.js';

describe('encodeRscPath', () => {
  test('encodes rscPath', () => {
    expect(encodeRscPath('')).toBe('_.txt');
    expect(encodeRscPath('foo')).toBe('foo.txt');
    expect(encodeRscPath('foo/')).toBe('foo/_.txt');
    expect(encodeRscPath('/foo')).toBe('_/foo.txt');
    expect(encodeRscPath('/foo/')).toBe('_/foo/_.txt');
  });

  test('encodes rscPath with underscore at boundaries', () => {
    expect(encodeRscPath('_foo')).toBe('__foo.txt');
    expect(encodeRscPath('foo_')).toBe('foo__.txt');
    expect(encodeRscPath('_foo_')).toBe('__foo__.txt');
    expect(encodeRscPath('_')).toBe('___.txt');
    expect(encodeRscPath('__')).toBe('____.txt');
    expect(encodeRscPath('_/')).toBe('__/_.txt');
    expect(encodeRscPath('/_')).toBe('_/__.txt');
  });
});

describe('decodeRscPath', () => {
  test('decodes rscPath', () => {
    expect(decodeRscPath('_.txt')).toBe('');
    expect(decodeRscPath('foo.txt')).toBe('foo');
    expect(decodeRscPath('foo/_.txt')).toBe('foo/');
    expect(decodeRscPath('_/foo.txt')).toBe('/foo');
    expect(decodeRscPath('_/foo/_.txt')).toBe('/foo/');
  });

  test('decodes rscPath with underscore at boundaries', () => {
    expect(decodeRscPath('__foo.txt')).toBe('_foo');
    expect(decodeRscPath('foo__.txt')).toBe('foo_');
    expect(decodeRscPath('__foo__.txt')).toBe('_foo_');
    expect(decodeRscPath('___.txt')).toBe('_');
    expect(decodeRscPath('____.txt')).toBe('__');
    expect(decodeRscPath('__/_.txt')).toBe('_/');
    expect(decodeRscPath('_/__.txt')).toBe('/_');
  });

  test('throws on invalid rscPath', () => {
    expect(() => decodeRscPath('foo')).toThrow();
  });
});

describe('encodeFuncId', () => {
  test('encodes funcId', () => {
    expect(encodeFuncId('foo#bar')).toBe('F/foo/bar');
  });

  test('encodes funcId with underscore prefix', () => {
    expect(encodeFuncId('_foo#bar')).toBe('F/__foo/bar');
  });

  test('throws on invalid funcId', () => {
    expect(() => encodeFuncId('foo#bar/baz')).toThrow();
  });
});

describe('decodeFuncId', () => {
  test('decodes funcId', () => {
    expect(decodeFuncId('F/foo/bar')).toBe('foo#bar');
  });

  test('decodes funcId with underscore prefix', () => {
    expect(decodeFuncId('F/__foo/bar')).toBe('_foo#bar');
  });

  test('returns null on invalid funcId', () => {
    expect(decodeFuncId('foo/bar')).toBe(null);
  });
});

describe('pathnameToRoutePath', () => {
  test('canonicalizes trailing slash and index.html', () => {
    expect(pathnameToRoutePath('/')).toBe('/');
    expect(pathnameToRoutePath('/foo')).toBe('/foo');
    expect(pathnameToRoutePath('/foo/')).toBe('/foo');
    expect(pathnameToRoutePath('/index.html')).toBe('/');
    expect(pathnameToRoutePath('/foo/index.html')).toBe('/foo');
  });

  test('throws on invalid pathname', () => {
    expect(() => pathnameToRoutePath('foo')).toThrow();
  });
});

describe('encodeRoutePath', () => {
  test('encodes routePath', () => {
    expect(encodeRoutePath('/')).toBe('R/_root');
    expect(encodeRoutePath('/foo')).toBe('R/foo');
    expect(encodeRoutePath('/foo/bar')).toBe('R/foo/bar');
  });

  test('throws on invalid routePath', () => {
    expect(() => encodeRoutePath('foo')).toThrow();
    expect(() => encodeRoutePath('/foo/')).toThrow();
    expect(() => encodeRoutePath('/index.html')).toThrow();
    expect(() => encodeRoutePath('/foo/index.html')).toThrow();
  });
});

describe('decodeRoutePath', () => {
  test('decodes routePath', () => {
    expect(decodeRoutePath('R/_root')).toBe('/');
    expect(decodeRoutePath('R/foo')).toBe('/foo');
    expect(decodeRoutePath('R/foo/bar')).toBe('/foo/bar');
  });

  test('throws on invalid routePath', () => {
    expect(() => decodeRoutePath('foo')).toThrow();
  });
});

describe('encodeRoutePath & decodeRoutePath', () => {
  test('escape _ prefix', () => {
    expect(decodeRoutePath(encodeRoutePath('/_root'))).toBe('/_root');
  });
});
