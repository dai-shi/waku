type Elements = Record<string | symbol, unknown>;

export type PrefetchMode = 'always' | 'once';

export type PrefetchOptions = {
  /** Default: dedupe by TTL only. `'once'` also skips if this path was already stored. */
  mode?: PrefetchMode;
  /** Milliseconds; defaults to `PREFETCH_TTL`. */
  ttl?: number;
};

export type PrefetchEntry = {
  promise: Promise<Elements>;
  expireAt: number;
  onInvalidate: (callback: () => void) => () => void;
};

type PrefetchCache = Map<string, PrefetchEntry>;

// null = first prefetch still in flight; served under the etag protocol
type PrefetchedElementsCache = Map<string, Elements | null>;

export const PREFETCH_TTL = 1000 * 60;
export const PREFETCH_LIMIT = 100;

const prefetchCacheKey = (rscPath: string, query: string): string =>
  rscPath + '\0' + query;

const getPrefetch = (
  prefetchCache: PrefetchCache,
  key: string,
  now: number,
): PrefetchEntry | undefined => {
  const entry = prefetchCache.get(key);
  if (entry && entry.expireAt <= now) {
    prefetchCache.delete(key);
    return undefined;
  }
  return entry;
};

const setPrefetch = (
  prefetchCache: PrefetchCache,
  key: string,
  entry: PrefetchEntry,
): void => {
  while (prefetchCache.size >= PREFETCH_LIMIT) {
    const oldest = prefetchCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    prefetchCache.delete(oldest);
  }
  prefetchCache.set(key, entry);
};

const reservePrefetchedElements = (
  prefetchedElementsCache: PrefetchedElementsCache,
  rscPath: string,
): void => {
  if (prefetchedElementsCache.has(rscPath)) {
    return;
  }
  if (prefetchedElementsCache.size >= PREFETCH_LIMIT) {
    const oldestKey = prefetchedElementsCache.keys().next().value;
    if (oldestKey !== undefined) {
      prefetchedElementsCache.delete(oldestKey);
    }
  }
  prefetchedElementsCache.set(rscPath, null);
};

const releasePrefetchedElements = (
  prefetchedElementsCache: PrefetchedElementsCache,
  rscPath: string,
): void => {
  if (prefetchedElementsCache.get(rscPath) === null) {
    prefetchedElementsCache.delete(rscPath);
  }
};

const mergePrefetchedElements = (
  prefetchedElementsCache: PrefetchedElementsCache,
  rscPath: string,
  elements: Elements,
): void => {
  reservePrefetchedElements(prefetchedElementsCache, rscPath);
  const existing = prefetchedElementsCache.get(rscPath);
  prefetchedElementsCache.set(
    rscPath,
    existing ? { ...existing, ...elements } : elements,
  );
};

type PrefetchManager = {
  prefetch: (
    rscPath: string,
    query: string,
    fetchElements: (
      base: Elements | undefined,
      invalidate: () => void,
    ) => Promise<Elements>,
    options: PrefetchOptions | undefined,
  ) => void;
  get: (rscPath: string, query: string) => PrefetchEntry | undefined;
  getElements: (rscPath: string) => Elements | undefined;
  clear: () => void;
};

export const createPrefetchManager = (): PrefetchManager => {
  let prefetchCache: PrefetchCache = new Map();
  let prefetchedElementsCache: PrefetchedElementsCache = new Map();
  return {
    prefetch: (rscPath, query, fetchElements, options) =>
      startPrefetch(
        prefetchCache,
        prefetchedElementsCache,
        rscPath,
        query,
        fetchElements,
        options,
      ),
    get: (rscPath, query) =>
      getPrefetch(prefetchCache, prefetchCacheKey(rscPath, query), Date.now()),
    getElements: (rscPath) => prefetchedElementsCache.get(rscPath) ?? undefined,
    clear: () => {
      // replace the maps so an in-flight prefetch completes into detached ones
      prefetchCache = new Map();
      prefetchedElementsCache = new Map();
    },
  };
};

const startPrefetch = (
  prefetchCache: PrefetchCache,
  prefetchedElementsCache: PrefetchedElementsCache,
  rscPath: string,
  query: string,
  fetchElements: (
    base: Elements | undefined,
    invalidate: () => void,
  ) => Promise<Elements>,
  options: PrefetchOptions | undefined,
): void => {
  if (options?.mode === 'once' && prefetchedElementsCache.has(rscPath)) {
    return;
  }
  // Keep an already-resolved response within the ttl instead of replacing it
  // with an in-flight one.
  const key = prefetchCacheKey(rscPath, query);
  const now = Date.now();
  if (getPrefetch(prefetchCache, key, now)) {
    return;
  }
  const base = prefetchedElementsCache.get(rscPath) ?? undefined;
  let invalidated = false;
  // a shared entry can have more than one load adopter
  const invalidationCallbacks = new Set<() => void>();
  const onInvalidate = (callback: () => void): (() => void) => {
    if (invalidated) {
      callback();
      return () => {};
    }
    invalidationCallbacks.add(callback);
    return () => {
      invalidationCallbacks.delete(callback);
    };
  };
  const invalidate = () => {
    if (invalidated) {
      return;
    }
    invalidated = true;
    if (prefetchCache.get(key)?.onInvalidate === onInvalidate) {
      prefetchCache.delete(key);
    }
    prefetchedElementsCache.delete(rscPath);
    const callbacks = [...invalidationCallbacks];
    invalidationCallbacks.clear();
    callbacks.forEach((callback) => callback());
  };
  const promise = fetchElements(base, invalidate);
  const entry: PrefetchEntry = {
    promise,
    expireAt: now + (options?.ttl ?? PREFETCH_TTL),
    onInvalidate,
  };
  if (!invalidated) {
    setPrefetch(prefetchCache, key, entry);
    reservePrefetchedElements(prefetchedElementsCache, rscPath);
  }
  promise.then(
    (resolved) => {
      if (!invalidated) {
        mergePrefetchedElements(prefetchedElementsCache, rscPath, resolved);
      }
    },
    () => {
      // TODO a negative ttl, so a route that answers with a document location
      // is not fetched again on every hover
      if (prefetchCache.get(key) === entry) {
        prefetchCache.delete(key);
      }
      releasePrefetchedElements(prefetchedElementsCache, rscPath);
    },
  );
};
