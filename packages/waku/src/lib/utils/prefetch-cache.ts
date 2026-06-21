// Client-side cache of prefetched navigations: a prefetch decodes the route
// eagerly so a later navigation reuses the decoded tree without re-fetching.
// Bounded by a ttl and a max size.

/** How long (ms) a prefetched entry stays usable before it is discarded. */
export const PREFETCH_TTL = 1000 * 60;

/** Maximum number of prefetched entries kept at once. */
export const PREFETCH_LIMIT = 100;

// This is exported only for global-types.ts. It is not a public API.
export type PrefetchEntry = {
  rscPath: string;
  rscParams: unknown;
  elements: unknown;
  expireAt: number;
};

const getCache = (): PrefetchEntry[] => (globalThis.__WAKU_PREFETCHED__ ||= []);

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

/** Decode and cache a prefetch so a later navigation can reuse the tree. */
export const addPrefetchEntry = <Elements>(
  rscPath: string,
  rscParams: unknown,
  elements: Elements,
): void => {
  const cache = getCache();
  const now = Date.now();
  // Mark as handled so a prefetch that is never consumed stays quiet.
  Promise.resolve(elements).catch(() => {});
  cache.push({ rscPath, rscParams, elements, expireAt: now + PREFETCH_TTL });
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

/** Consume a fresh prefetch, returning its eagerly decoded tree. */
export const consumePrefetchEntry = <Elements>(
  rscPath: string,
  rscParams: unknown,
): Elements | undefined => {
  const cache = getCache();
  const index = findFreshIndex(cache, rscPath, rscParams, Date.now());
  if (index < 0) {
    return undefined;
  }
  return cache.splice(index, 1)[0]!.elements as Elements;
};
