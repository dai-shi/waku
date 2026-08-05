/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getHashElement,
  scrollToHash,
  shouldScrollByDefault,
  shouldScrollForRouteChange,
} from '../src/router/client-utils/scroll.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
});

const append = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
};

describe('getHashElement', () => {
  test('an id wins, and an anchor name counts', () => {
    append('<a name="intro">by name</a><div id="body">by id</div>');
    expect(getHashElement('#body')?.id).toBe('body');
    expect(getHashElement('#intro')?.localName).toBe('a');
  });

  test('a named element that is not an anchor is not a target', () => {
    append('<input name="section" /><meta name="description" />');
    expect(getHashElement('#section')).toBeNull();
    expect(getHashElement('#description')).toBeNull();
  });

  test('a percent encoded name decodes', () => {
    append('<div id="café au lait">x</div><div id="あ">y</div>');
    expect(getHashElement('#caf%C3%A9%20au%20lait')?.textContent).toBe('x');
    expect(getHashElement('#%E3%81%82')?.textContent).toBe('y');
  });

  test('a malformed escape leaves that part alone', () => {
    append('<div id="foo bar%ZZ">x</div>');
    expect(getHashElement('#foo%20bar%ZZ')?.textContent).toBe('x');
  });

  test('top means the document, decoded or not, unless something claims it', () => {
    expect(getHashElement('#top')).toBe(document.documentElement);
    expect(getHashElement('#%74op')).toBe(document.documentElement);
    expect(getHashElement('#TOP')).toBe(document.documentElement);
    append('<div id="top">mine</div>');
    expect(getHashElement('#top')?.textContent).toBe('mine');
  });

  test('an unknown fragment finds nothing', () => {
    expect(getHashElement('#nowhere')).toBeNull();
  });
});

describe('scrollToHash', () => {
  test('a missing target scrolls to the top only when asked', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      scrollToHash('#gone', 'auto', false);
      expect(scrollTo).not.toHaveBeenCalled();
      scrollToHash('#gone', 'instant', true);
      expect(scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      scrollTo.mockRestore();
    }
  });
});

describe('scroll policy', () => {
  test('a route change scrolls on a new path or a new hash', () => {
    const at = (path: string, hash = '') => ({ path, query: '', hash });
    expect(shouldScrollForRouteChange(at('/b'), at('/a'))).toBe(true);
    expect(shouldScrollForRouteChange(at('/a', '#x'), at('/a'))).toBe(true);
    expect(shouldScrollForRouteChange(at('/a'), at('/a'))).toBe(false);
  });

  test('by default a query only move does not scroll', () => {
    window.history.replaceState({}, '', '/a?x=1#top');
    try {
      const url = (href: string) => new URL(href, window.location.origin);
      expect(shouldScrollByDefault(url('/a?x=2#top'))).toBe(false);
      expect(shouldScrollByDefault(url('/a?x=1#other'))).toBe(true);
      expect(shouldScrollByDefault(url('/b?x=1#top'))).toBe(true);
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });
});
