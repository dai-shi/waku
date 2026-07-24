// Router-scoped cache of prefetched route trees. Keyed by (rscPath, query) so a
// prefetch for one query is never reused for another, and bounded by a ttl and a
// size limit so hover-prefetching in a long session cannot grow without bound.

type Elements = Record<string, unknown>;

export type PrefetchMode = 'always' | 'once';

export type PrefetchOptions = {
  mode?: PrefetchMode;
  ttl?: number;
};

export type PrefetchEntry = {
  promise: Promise<Elements>;
  expireAt: number;
};

type PrefetchCache = Map<string, PrefetchEntry>;

// Session store of prefetched responses, keyed by rscPath alone. Entries are
// only served under the etag protocol: they paint immutable slots (which
// cannot vary by query) and fall back for a dynamic slot only when the
// server omits it, which proves the stored copy current. A null entry marks
// a route whose first prefetch is still in flight.
type PrefetchedElementsStore = Map<string, Elements | null>;

export const PREFETCH_TTL = 1000 * 60;
export const PREFETCH_LIMIT = 100;

const prefetchCacheKey = (rscPath: string, query: string): string =>
  rscPath + '\0' + query;

/** Return a still-fresh entry for the key, evicting it if it has expired. */
const getPrefetch = (
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
const setPrefetch = (
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

/** Reserve a route in the store while its first prefetch is in flight. */
const reservePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
): void => {
  if (store.has(rscPath)) {
    return;
  }
  if (store.size >= PREFETCH_LIMIT) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
  store.set(rscPath, null);
};

/** Release a reservation that was never fulfilled. */
const releasePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
): void => {
  if (store.get(rscPath) === null) {
    store.delete(rscPath);
  }
};

/** Merge a prefetched response into the session store. */
const mergePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
  elements: Elements,
): void => {
  reservePrefetchedElements(store, rscPath);
  const existing = store.get(rscPath);
  store.set(rscPath, existing ? { ...existing, ...elements } : elements);
};

/** One store for prefetched routes; the router does not see the two caches. */
type PrefetchManager = {
  prefetch: (
    rscPath: string,
    query: string,
    fetchElements: (base: Elements | undefined) => Promise<Elements>,
    options: PrefetchOptions | undefined,
  ) => void;
  get: (rscPath: string, query: string) => PrefetchEntry | undefined;
  getElements: (rscPath: string) => Elements | undefined;
  clear: () => void;
};

export const createPrefetchManager = (): PrefetchManager => {
  let cache: PrefetchCache = new Map();
  let store: PrefetchedElementsStore = new Map();
  return {
    prefetch: (rscPath, query, fetchElements, options) =>
      startPrefetch(cache, store, rscPath, query, fetchElements, options),
    get: (rscPath, query) =>
      getPrefetch(cache, prefetchCacheKey(rscPath, query), Date.now()),
    getElements: (rscPath) => store.get(rscPath) ?? undefined,
    clear: () => {
      // replace the maps so an in-flight prefetch completes into detached ones
      cache = new Map();
      store = new Map();
    },
  };
};

/** Start a prefetch unless the mode or an entry within its ttl dedupes it. */
const startPrefetch = (
  cache: PrefetchCache,
  store: PrefetchedElementsStore,
  rscPath: string,
  query: string,
  fetchElements: (base: Elements | undefined) => Promise<Elements>,
  options: PrefetchOptions | undefined,
): void => {
  if (options?.mode === 'once' && store.has(rscPath)) {
    return;
  }
  // Dedupe per (path, query), so a repeat trigger within the ttl keeps an
  // already-resolved response instead of replacing it with an in-flight one.
  const key = prefetchCacheKey(rscPath, query);
  const now = Date.now();
  if (getPrefetch(cache, key, now)) {
    return;
  }
  const base = store.get(rscPath) ?? undefined;
  const promise = fetchElements(base);
  const entry: PrefetchEntry = {
    promise,
    expireAt: now + (options?.ttl ?? PREFETCH_TTL),
  };
  setPrefetch(cache, key, entry);
  reservePrefetchedElements(store, rscPath);
  promise.then(
    (resolved) => {
      mergePrefetchedElements(store, rscPath, resolved);
    },
    () => {
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
      releasePrefetchedElements(store, rscPath);
    },
  );
};
