/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { unstable_fetchRsc as fetchRsc } from '../src/minimal/client.js';
import {
  canReuseStaticRoute,
  clearCaches,
  createRscParams,
  getPrefetch,
  getPrefetchedElements,
  hasCachedShell,
  learnStaticFromElements,
  prefetchRoute,
} from '../src/router/client-core-utils/caches.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

vi.mock('../src/minimal/client.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/minimal/client.js')>();
  return {
    ...actual,
    unstable_fetchRsc: vi.fn(),
  };
});

type Elements = Record<string, unknown>;

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const immutable = (path: string) => ({
  [ETAG_ID_PREFIX + getRouteSlotId(path)]: IMMUTABLE_ETAG,
});

const pending = () => new Promise<Elements>(() => {});

const settlePrefetch = async (
  path: string,
  query: string,
  elements: Elements,
) => {
  vi.mocked(fetchRsc).mockImplementationOnce(async () => elements);
  prefetchRoute(route(path, query));
  await Promise.resolve();
  await Promise.resolve();
};

describe('layer-1 router caches', () => {
  afterEach(() => {
    clearCaches();
    vi.mocked(fetchRsc).mockReset();
    vi.useRealTimers();
  });

  it('hasCachedShell is true when the current elements hold an immutable route slot', () => {
    expect(hasCachedShell(route('/a'), immutable('/a'))).toBe(true);
  });

  it('hasCachedShell is true when only the prefetched elements hold the slot', async () => {
    await settlePrefetch('/a', '', immutable('/a'));
    expect(hasCachedShell(route('/a'), {})).toBe(true);
  });

  it('hasCachedShell is false without an immutable etag for the slot', () => {
    expect(
      hasCachedShell(route('/a'), {
        [ETAG_ID_PREFIX + getRouteSlotId('/a')]: 'W/"mutable"',
      }),
    ).toBe(false);
  });

  it('getPrefetchedElements is keyed by route path, encoding the rscPath internally', async () => {
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch('/next', 'q=a', shell);
    expect(getPrefetchedElements(route('/next', 'q=b'))).toEqual(shell);
    expect(getPrefetchedElements(route('/other'))).toBeUndefined();
  });

  it('returns the stored elements object, not a clone', async () => {
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch('/next', '', shell);
    expect(getPrefetchedElements(route('/next'))).toBe(shell);
  });

  it('learnStaticFromElements records only static routes', () => {
    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    learnStaticFromElements({
      [ROUTE_ID]: ['/dynamic', ''],
      [IS_STATIC_ID]: false,
    });
    learnStaticFromElements({});
    expect(canReuseStaticRoute(route('/static'), {})).toBe(false);
    expect(
      canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    expect(
      canReuseStaticRoute(route('/dynamic'), {
        [getRouteSlotId('/dynamic')]: 'page',
      }),
    ).toBe(false);
  });

  it('prefetchRoute fetches a path already learned as static', () => {
    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });

  it('prefetchRoute fetches by encoded rscPath and sends the query as RSC params', () => {
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/next', 'x=1'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    const rscParams = vi.mocked(fetchRsc).mock.calls[0]?.[1];
    expect(rscParams).toBeInstanceOf(URLSearchParams);
    expect((rscParams as URLSearchParams).get('query')).toBe('x=1');
    expect(vi.mocked(fetchRsc).mock.calls[0]?.[0]).toBe(
      encodeRoutePath('/next'),
    );
    expect(vi.mocked(fetchRsc).mock.calls[0]?.[2]).toEqual({
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
    vi.mocked(fetchRsc).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    prefetchRoute(route('/p'));
    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    clearCaches();
    resolveFetch({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(getPrefetchedElements(route('/p'))).toBeUndefined();
    expect(getPrefetch(route('/p'))).toBeUndefined();
    expect(
      canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('getPrefetch is keyed by path and query', () => {
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/p', 'q=1'));
    expect(getPrefetch(route('/p', 'q=1'))).toBeDefined();
    expect(getPrefetch(route('/p', 'q=2'))).toBeUndefined();
  });

  it('a build-id mismatch drops the prefetch store and keeps static paths', async () => {
    await settlePrefetch('/a', '', { a: 1 });
    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    vi.mocked(fetchRsc).mockImplementationOnce(pending);
    prefetchRoute(route('/c'));
    const onBuildIdMismatch = vi.mocked(fetchRsc).mock.calls.at(-1)?.[2]
      ?.onBuildIdMismatch as (() => void) | undefined;
    onBuildIdMismatch?.();
    expect(getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(getPrefetch(route('/c'))).toBeUndefined();
    expect(
      canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('getPrefetch is undefined after ttl expiry', () => {
    vi.useFakeTimers();
    vi.mocked(fetchRsc).mockImplementation(pending);
    prefetchRoute(route('/a'), { ttl: 1000 });
    expect(getPrefetch(route('/a'))).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(getPrefetch(route('/a'))).toBeUndefined();
  });

  it("mode 'once' skips a stored shell; 'always' dedupes by TTL only", async () => {
    await settlePrefetch('/p', 'q=a', { a: 1 });
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);

    prefetchRoute(route('/p', 'q=b'), { mode: 'once' });
    expect(fetchRsc).not.toHaveBeenCalled();

    prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });
});
