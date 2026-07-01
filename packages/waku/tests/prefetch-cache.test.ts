import { describe, expect, it } from 'vitest';
import {
  PREFETCH_LIMIT,
  PREFETCH_TTL,
  getPrefetch,
  prefetchCacheKey,
  setPrefetch,
} from '../src/router/prefetch-cache.js';
import type {
  PrefetchCache,
  PrefetchEntry,
} from '../src/router/prefetch-cache.js';

const entry = (expireAt: number): PrefetchEntry => ({
  promise: Promise.resolve({}),
  expireAt,
});

describe('router prefetch cache', () => {
  it('keys distinctly by path and query', () => {
    expect(prefetchCacheKey('/x', 'a=1')).toBe(prefetchCacheKey('/x', 'a=1'));
    expect(prefetchCacheKey('/x', 'a=1')).not.toBe(
      prefetchCacheKey('/x', 'a=2'),
    );
    expect(prefetchCacheKey('/x', '')).not.toBe(prefetchCacheKey('/y', ''));
  });

  it('returns a fresh entry and evicts an expired one on read', () => {
    const cache: PrefetchCache = new Map();
    const key = prefetchCacheKey('/x', '');
    setPrefetch(cache, key, entry(1000));
    expect(getPrefetch(cache, key, 999)).toBeDefined();
    expect(getPrefetch(cache, key, 1000)).toBeUndefined();
    expect(cache.has(key)).toBe(false);
  });

  it('bounds the cache at PREFETCH_LIMIT, evicting the oldest first', () => {
    const cache: PrefetchCache = new Map();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      setPrefetch(cache, prefetchCacheKey('/p', String(i)), entry(Infinity));
    }
    expect(cache.size).toBe(PREFETCH_LIMIT);
    expect(cache.has(prefetchCacheKey('/p', '0'))).toBe(false);
    expect(cache.has(prefetchCacheKey('/p', '4'))).toBe(false);
    expect(cache.has(prefetchCacheKey('/p', '5'))).toBe(true);
    expect(cache.has(prefetchCacheKey('/p', String(PREFETCH_LIMIT + 4)))).toBe(
      true,
    );
  });

  it('has a positive ttl', () => {
    expect(PREFETCH_TTL).toBeGreaterThan(0);
  });
});
