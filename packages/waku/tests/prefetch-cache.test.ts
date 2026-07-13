import { describe, expect, it } from 'vitest';
import {
  PREFETCH_LIMIT,
  PREFETCH_TTL,
  getPrefetch,
  prefetchCacheKey,
  setPrefetch,
  startPrefetch,
} from '../src/router/prefetch-cache.js';
import type {
  PrefetchCache,
  PrefetchEntry,
  PrefetchedElementsStore,
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

  it('merges responses for the same rscPath in the store', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    await startAndSettle(cache, store, '/p', 'q=a', { a: 1 });
    await startAndSettle(cache, store, '/p', 'q=b', { b: 2 });
    expect(store.get('/p')).toEqual({ a: 1, b: 2 });
  });

  it('bounds the store at PREFETCH_LIMIT, evicting the oldest first', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      await startAndSettle(cache, store, `/p${i}`, '', { i });
    }
    expect(store.size).toBe(PREFETCH_LIMIT);
    expect(store.has('/p0')).toBe(false);
    expect(store.has('/p4')).toBe(false);
    expect(store.has('/p5')).toBe(true);
    expect(store.has(`/p${PREFETCH_LIMIT + 4}`)).toBe(true);
    // merging into an existing entry does not evict
    await startAndSettle(cache, store, '/p5', 'q=b', { j: 1 });
    expect(store.size).toBe(PREFETCH_LIMIT);
    expect(store.has('/p5')).toBe(true);
  });

  it('reserves the route while the first prefetch is in flight', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    let fetched = 0;
    let resolveFetch: (value: Record<string, unknown>) => void = () => {};
    const fetchElements = () => {
      fetched += 1;
      return new Promise<Record<string, unknown>>((resolve) => {
        resolveFetch = resolve;
      });
    };
    startPrefetch(cache, store, '/p', 'q=a', fetchElements, {
      mode: 'once',
    });
    startPrefetch(cache, store, '/p', 'q=b', fetchElements, {
      mode: 'once',
    });
    expect(fetched).toBe(1);
    resolveFetch({ a: 1 });
    await Promise.resolve();
    expect(store.get('/p')).toEqual({ a: 1 });
  });

  it('passes the stored entry to the fetcher as the base', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    await startAndSettle(cache, store, '/p', 'q=a', { a: 1 });
    let received: unknown = 'unset';
    startPrefetch(
      cache,
      store,
      '/p',
      'q=b',
      (base) => {
        received = base;
        return new Promise(() => {});
      },
      undefined,
    );
    expect(received).toEqual({ a: 1 });
  });

  it('passes no base while the first prefetch is in flight', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    startPrefetch(cache, store, '/p', 'q=a', () => new Promise(() => {}), {
      mode: 'always',
    });
    let received: unknown = 'unset';
    startPrefetch(
      cache,
      store,
      '/p',
      'q=b',
      (base) => {
        received = base;
        return new Promise(() => {});
      },
      undefined,
    );
    expect(received).toBeUndefined();
  });

  it('releases only an unfulfilled reservation', async () => {
    const cache: PrefetchCache = new Map();
    const store: PrefetchedElementsStore = new Map();
    await expect(
      startAndReject(cache, store, '/p', 'q=a'),
    ).resolves.toBeUndefined();
    expect(store.has('/p')).toBe(false);
    await startAndSettle(cache, store, '/p', 'q=b', { a: 1 });
    await expect(
      startAndReject(cache, store, '/p', 'q=c'),
    ).resolves.toBeUndefined();
    expect(store.get('/p')).toEqual({ a: 1 });
  });
});

const startAndSettle = async (
  cache: PrefetchCache,
  store: PrefetchedElementsStore,
  rscPath: string,
  query: string,
  elements: Record<string, unknown>,
) => {
  let resolveFetch: (value: Record<string, unknown>) => void = () => {};
  startPrefetch(
    cache,
    store,
    rscPath,
    query,
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        resolveFetch = resolve;
      }),
    undefined,
  );
  resolveFetch(elements);
  await Promise.resolve();
  await Promise.resolve();
};

const startAndReject = async (
  cache: PrefetchCache,
  store: PrefetchedElementsStore,
  rscPath: string,
  query: string,
) => {
  let rejectFetch: (reason: unknown) => void = () => {};
  startPrefetch(
    cache,
    store,
    rscPath,
    query,
    () =>
      new Promise<Record<string, unknown>>((_resolve, reject) => {
        rejectFetch = reject;
      }),
    undefined,
  );
  rejectFetch(new Error('network'));
  await Promise.resolve();
  await Promise.resolve();
};
