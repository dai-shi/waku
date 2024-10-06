import { test, describe, expect } from 'vitest';
import {
  encodeRscPath,
  decodeRscPath,
  encodeFuncId,
  decodeFuncId,
} from '../src/lib/renderers/utils.js';

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
    expect(() => encodeRscPath('foo_')).toThrow();
    expect(() => encodeRscPath('_foo_')).toThrow();
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

describe('encodeFuncId', () => {
  test('encodes funcId', () => {
    expect(encodeFuncId('foo#bar')).toBe('F/foo/bar');
  });

  test('throws on invalid funcId', () => {
    expect(() => encodeFuncId('foo#bar/baz')).toThrow();
  });
});

describe('decodeFuncId', () => {
  test('decodes funcId', () => {
    expect(decodeFuncId('F/foo/bar')).toBe('foo#bar');
  });

  test('returns null on invalid funcId', () => {
    expect(decodeFuncId('foo/bar')).toBe(null);
  });
});
