import { test, describe, expect } from 'vitest';
import { encodeRscPath, decodeRscPath } from '../src/lib/renderers/utils.js';

describe('encodeRscPath', () => {
  test('encodes rscPath', () => {
    expect(encodeRscPath('')).toBe('_.txt');
    expect(encodeRscPath('foo')).toBe('foo.txt');
    expect(encodeRscPath('foo/')).toBe('foo/_.txt');
    expect(encodeRscPath('/foo')).toBe('_/foo.txt');
    expect(encodeRscPath('/foo/')).toBe('_/foo/_.txt');
  });

  test('throws on invalid rscPath', () => {
    expect(() => encodeRscPath('_foo')).toThrow();
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

  test('throws on invalid rscPath', () => {
    expect(() => decodeRscPath('foo')).toThrow();
  });
});
