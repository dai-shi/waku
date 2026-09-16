/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETAGS_ID, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { adoptElements } from '../src/minimal/client-utils/element-etags.js';
import type { FetchRsc } from '../src/minimal/client-utils/root-store.js';
import {
  createRscParams,
  getRouterCache,
} from '../src/router/client-core-utils/caches.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

type Elements = Record<string, unknown>;

const fetchRsc = vi.fn<FetchRsc>();
const cache = getRouterCache(fetchRsc);

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const immutable = (path: string) =>
  adoptElements({
    [getRouteSlotId(path)]: {},
    [ETAGS_ID]: { [getRouteSlotId(path)]: IMMUTABLE_ETAG },
  });

const pending = () => new Promise<Elements>(() => {});

const settlePrefetch = async (
  path: string,
  query: string,
  elements: Elements,
) => {
  fetchRsc.mockImplementationOnce(async () => elements);
  cache.prefetchRoute(route(path, query));
  await Promise.resolve();
  await Promise.resolve();
};

describe('layer-1 router caches', () => {
  afterEach(() => {
    cache.clearCaches();
    fetchRsc.mockReset();
    vi.useRealTimers();
  });

  it('gives each Root its own cache, keyed by its fetch', async () => {
    expect(getRouterCache(fetchRsc)).toBe(cache);
    const otherFetch = vi.fn<FetchRsc>();
    const other = getRouterCache(otherFetch);
    expect(other).not.toBe(cache);

    await settlePrefetch('/a', '', immutable('/a'));

    expect(cache.getPrefetchedElements(route('/a'))).toBeDefined();
    expect(other.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(otherFetch).not.toHaveBeenCalled();
    other.clearCaches();
  });

  it('hasCachedShell is true when the current elements hold an immutable route slot', () => {
    expect(cache.hasCachedShell(route('/a'), immutable('/a'))).toBe(true);
  });

  it('hasCachedShell is true when only the prefetched elements hold the slot', async () => {
    await settlePrefetch('/a', '', immutable('/a'));
    expect(cache.hasCachedShell(route('/a'), {})).toBe(true);
  });

  it('a repeat prefetch keeps the immutable route slot it merges into', async () => {
    await settlePrefetch('/a', 'q=1', immutable('/a'));
    await settlePrefetch('/a', 'q=2', adoptElements({ other: 'x' }));
    expect(cache.hasCachedShell(route('/a'), {})).toBe(true);
  });

  it('hasCachedShell is false without an immutable etag for the slot', () => {
    expect(
      cache.hasCachedShell(
        route('/a'),
        adoptElements({
          [getRouteSlotId('/a')]: {},
          [ETAGS_ID]: { [getRouteSlotId('/a')]: 'W/"mutable"' },
        }),
      ),
    ).toBe(false);
  });

  it('getPrefetchedElements is keyed by route path, encoding the rscPath internally', async () => {
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch('/next', 'q=a', shell);
    expect(cache.getPrefetchedElements(route('/next', 'q=b'))).toEqual(shell);
    expect(cache.getPrefetchedElements(route('/other'))).toBeUndefined();
  });

  it('returns the stored elements object, not a clone', async () => {
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch('/next', '', shell);
    expect(cache.getPrefetchedElements(route('/next'))).toBe(shell);
  });

  it('learnStaticFromElements records only static routes', () => {
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/dynamic', ''],
      [IS_STATIC_ID]: false,
    });
    cache.learnStaticFromElements({});
    expect(cache.canReuseStaticRoute(route('/static'), {})).toBe(false);
    expect(
      cache.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    expect(
      cache.canReuseStaticRoute(route('/dynamic'), {
        [getRouteSlotId('/dynamic')]: 'page',
      }),
    ).toBe(false);
  });

  it('prefetchRoute fetches a path already learned as static', () => {
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });

  it('prefetchRoute fetches by encoded rscPath and sends the query as RSC params', () => {
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/next', 'x=1'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    const rscParams = fetchRsc.mock.calls[0]?.[1];
    expect(rscParams).toBeInstanceOf(URLSearchParams);
    expect((rscParams as URLSearchParams).get('query')).toBe('x=1');
    expect(fetchRsc.mock.calls[0]?.[0]).toBe(encodeRoutePath('/next'));
    expect(fetchRsc.mock.calls[0]?.[2]).toEqual({
      onBuildIdMismatch: expect.any(Function),
    });
  });

  it('createRscParams is a plain factory and does not memoize', () => {
    const first = createRscParams('a=1');
    expect(createRscParams('a=1')).not.toBe(first);
    expect(first.get('query')).toBe('a=1');
    expect(createRscParams('a=1').get('query')).toBe('a=1');
  });

  it('clearCaches detaches an in-flight prefetch and forgets static paths', async () => {
    let resolveFetch!: (elements: Elements) => void;
    fetchRsc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    cache.prefetchRoute(route('/p'));
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    cache.clearCaches();
    resolveFetch({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.getPrefetchedElements(route('/p'))).toBeUndefined();
    expect(cache.getPrefetch(route('/p'))).toBeUndefined();
    expect(
      cache.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);
    fetchRsc.mockClear();
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('getPrefetch is keyed by path and query', () => {
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/p', 'q=1'));
    expect(cache.getPrefetch(route('/p', 'q=1'))).toBeDefined();
    expect(cache.getPrefetch(route('/p', 'q=2'))).toBeUndefined();
  });

  it('a build-id mismatch drops the prefetch store and keeps static paths', async () => {
    await settlePrefetch('/a', '', { a: 1 });
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    fetchRsc.mockImplementationOnce(pending);
    cache.prefetchRoute(route('/c'));
    const onBuildIdMismatch = fetchRsc.mock.calls.at(-1)?.[2]
      ?.onBuildIdMismatch as (() => void) | undefined;
    onBuildIdMismatch?.();
    expect(cache.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(cache.getPrefetch(route('/c'))).toBeUndefined();
    expect(
      cache.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    fetchRsc.mockClear();
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('getPrefetch is undefined after ttl expiry', () => {
    vi.useFakeTimers();
    fetchRsc.mockImplementation(pending);
    cache.prefetchRoute(route('/a'), { ttl: 1000 });
    expect(cache.getPrefetch(route('/a'))).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(cache.getPrefetch(route('/a'))).toBeUndefined();
  });

  it("mode 'once' skips a stored shell; 'always' dedupes by TTL only", async () => {
    await settlePrefetch('/p', 'q=a', { a: 1 });
    fetchRsc.mockClear();
    fetchRsc.mockImplementation(pending);

    cache.prefetchRoute(route('/p', 'q=b'), { mode: 'once' });
    expect(fetchRsc).not.toHaveBeenCalled();

    cache.prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    cache.prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });
});
