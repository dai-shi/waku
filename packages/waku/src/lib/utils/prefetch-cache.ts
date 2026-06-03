// Client-side cache of prefetched navigations: a prefetch decodes the route
// eagerly so a later navigation reuses it without re-fetching. Each entry keeps
// a mutable store so the decoded tree's server actions bind to the consuming
// navigation's store, not the prefetch's. Bounded by a ttl and a max size.

/** How long (ms) a prefetched entry stays usable before it is discarded. */
export const PREFETCH_TTL = 1000 * 60;

/** Maximum number of prefetched entries kept at once. */
export const PREFETCH_LIMIT = 100;

type PrefetchEntry = {
  rscPath: string;
  rscParams: unknown;
  getElements: (store: never) => unknown;
  expireAt: number;
};

const getCache = (): PrefetchEntry[] =>
  ((globalThis as any).__WAKU_PREFETCHED__ ||= []);

const findFreshIndex = (
  cache: PrefetchEntry[],
  rscPath: string,
  rscParams: unknown,
  now: number,
) =>
  cache.findIndex(
    (entry) =>
      entry.expireAt > now &&
      entry.rscPath === rscPath &&
      // rscParams is intentionally compared by reference.
      entry.rscParams === rscParams,
  );

/**
 * Decode and cache a prefetch. `getStore` returns the entry's currently bound
 * store: the prefetch's now, the navigation's after `consumePrefetchEntry`.
 */
export const addPrefetchEntry = <Store, Elements>(
  rscPath: string,
  rscParams: unknown,
  store: Store,
  decode: (getStore: () => Store) => Elements,
): void => {
  const cache = getCache();
  const now = Date.now();
  let currentStore = store;
  const elements = decode(() => currentStore);
  // Mark as handled so a prefetch that is never consumed stays quiet.
  Promise.resolve(elements).catch(() => {});
  const getElements = (nextStore: Store): Elements => {
    currentStore = nextStore;
    return elements;
  };
  cache.push({ rscPath, rscParams, getElements, expireAt: now + PREFETCH_TTL });
  while (
    cache.length > 0 &&
    (cache.length > PREFETCH_LIMIT || cache[0]!.expireAt <= now)
  ) {
    cache.shift();
  }
};

export const hasPrefetchEntry = (
  rscPath: string,
  rscParams: unknown,
): boolean => {
  const cache = getCache();
  return findFreshIndex(cache, rscPath, rscParams, Date.now()) >= 0;
};

/**
 * Consume a fresh prefetch, rebinding its decoded tree to the consumer's store.
 */
export const consumePrefetchEntry = <Store, Elements>(
  rscPath: string,
  rscParams: unknown,
  store: Store,
): Elements | undefined => {
  const cache = getCache();
  const index = findFreshIndex(cache, rscPath, rscParams, Date.now());
  if (index < 0) {
    return undefined;
  }
  const { getElements } = cache.splice(index, 1)[0]!;
  return (getElements as (s: Store) => Elements)(store);
};
