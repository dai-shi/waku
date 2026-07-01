// Router-scoped cache of prefetched route trees. Keyed by (rscPath, query) so a
// prefetch for one query is never reused for another, and bounded by a ttl and a
// size limit so hover-prefetching in a long session cannot grow without bound.

type Elements = Record<string, unknown>;

export type PrefetchEntry = {
  promise: Promise<Elements>;
  resolved?: Elements;
  expireAt: number;
};

export type PrefetchCache = Map<string, PrefetchEntry>;

export const PREFETCH_TTL = 1000 * 60;
export const PREFETCH_LIMIT = 100;

export const prefetchCacheKey = (rscPath: string, query: string): string =>
  rscPath + '\0' + query;

/** Return a still-fresh entry for the key, evicting it if it has expired. */
export const getPrefetch = (
  cache: PrefetchCache,
  key: string,
  now: number,
): PrefetchEntry | undefined => {
  const entry = cache.get(key);
  if (entry && entry.expireAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry;
};

/** Insert an entry, evicting the oldest ones once the size limit is reached. */
export const setPrefetch = (
  cache: PrefetchCache,
  key: string,
  entry: PrefetchEntry,
): void => {
  while (cache.size >= PREFETCH_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
  cache.set(key, entry);
};
