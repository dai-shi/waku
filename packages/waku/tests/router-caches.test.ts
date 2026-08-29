/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { unstable_fetchRsc as fetchRsc } from '../src/minimal/client.js';
import {
  canReuseStaticRoute,
  clearCaches,
  clearRegisteredLazySlices,
  createCaches,
  createRscParams,
  forEachRegisteredLazySlice,
  getPrefetch,
  getPrefetchedElements,
  learnStaticFromElements,
  prefetchRoute,
  registerLazySlice,
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
  caches: ReturnType<typeof createCaches>,
  path: string,
  query: string,
  elements: Elements,
) => {
  vi.mocked(fetchRsc).mockImplementationOnce(async () => elements);
  caches.prefetchRoute(route(path, query));
  await Promise.resolve();
  await Promise.resolve();
};

describe('layer-1 router caches', () => {
  afterEach(() => {
    clearCaches();
    clearRegisteredLazySlices();
    vi.mocked(fetchRsc).mockReset();
    vi.useRealTimers();
  });

  it('hasCachedShell is true when the current elements hold an immutable route slot', () => {
    const caches = createCaches();
    expect(caches.hasCachedShell(route('/a'), immutable('/a'))).toBe(true);
  });

  it('hasCachedShell is true when only the prefetched elements hold the slot', async () => {
    const caches = createCaches();
    await settlePrefetch(caches, '/a', '', immutable('/a'));
    expect(caches.hasCachedShell(route('/a'), {})).toBe(true);
  });

  it('hasCachedShell is false without an immutable etag for the slot', () => {
    const caches = createCaches();
    expect(
      caches.hasCachedShell(route('/a'), {
        [ETAG_ID_PREFIX + getRouteSlotId('/a')]: 'W/"mutable"',
      }),
    ).toBe(false);
  });

  it('getPrefetchedElements is keyed by route path, encoding the rscPath internally', async () => {
    const caches = createCaches();
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch(caches, '/next', 'q=a', shell);
    expect(caches.getPrefetchedElements(route('/next', 'q=b'))).toEqual(shell);
    expect(caches.getPrefetchedElements(route('/other'))).toBeUndefined();
  });

  it('returns the stored elements object, not a clone', async () => {
    const caches = createCaches();
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch(caches, '/next', '', shell);
    expect(caches.getPrefetchedElements(route('/next'))).toBe(shell);
  });

  it('learnStaticFromElements records only static routes', () => {
    const caches = createCaches();
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/dynamic', ''],
      [IS_STATIC_ID]: false,
    });
    caches.learnStaticFromElements({});
    expect(caches.canReuseStaticRoute(route('/static'), {})).toBe(false);
    expect(
      caches.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    expect(
      caches.canReuseStaticRoute(route('/dynamic'), {
        [getRouteSlotId('/dynamic')]: 'page',
      }),
    ).toBe(false);
  });

  it('prefetchRoute fetches a path already learned as static', () => {
    const caches = createCaches();
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });

  it('prefetchRoute fetches by encoded rscPath and sends the query as RSC params', () => {
    vi.mocked(fetchRsc).mockImplementation(pending);
    const caches = createCaches();
    caches.prefetchRoute(route('/next', 'x=1'));
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

  it('createCaches isolates prefetch and static paths', async () => {
    const a = createCaches();
    const b = createCaches();
    await settlePrefetch(a, '/a', '', { a: 1 });
    a.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });

    expect(b.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(
      b.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);
  });

  it('clear() detaches an in-flight prefetch and forgets static paths', async () => {
    const caches = createCaches();
    let resolveFetch!: (elements: Elements) => void;
    vi.mocked(fetchRsc).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    caches.prefetchRoute(route('/p'));
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    caches.clear();
    resolveFetch({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(caches.getPrefetchedElements(route('/p'))).toBeUndefined();
    expect(caches.getPrefetch(route('/p'))).toBeUndefined();
    expect(
      caches.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('getPrefetch is keyed by path and query', () => {
    const caches = createCaches();
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/p', 'q=1'));
    expect(caches.getPrefetch(route('/p', 'q=1'))).toBeDefined();
    expect(caches.getPrefetch(route('/p', 'q=2'))).toBeUndefined();
  });

  it('a build-id mismatch drops the prefetch store and keeps static paths', async () => {
    const caches = createCaches();
    await settlePrefetch(caches, '/a', '', { a: 1 });
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    vi.mocked(fetchRsc).mockImplementationOnce(pending);
    caches.prefetchRoute(route('/c'));
    const onBuildIdMismatch = vi.mocked(fetchRsc).mock.calls.at(-1)?.[2]
      ?.onBuildIdMismatch as (() => void) | undefined;
    onBuildIdMismatch?.();
    expect(caches.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(caches.getPrefetch(route('/c'))).toBeUndefined();
    expect(
      caches.canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/static'));
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('module functions share one store that createCaches does not see', async () => {
    vi.mocked(fetchRsc).mockResolvedValue({ shell: 1 });
    prefetchRoute(route('/x'));
    await Promise.resolve();
    await Promise.resolve();
    expect(getPrefetchedElements(route('/x'))).toEqual({ shell: 1 });
    expect(getPrefetch(route('/x', ''))).toBeDefined();
    expect(createCaches().getPrefetchedElements(route('/x'))).toBeUndefined();

    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    expect(
      canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(true);
    expect(
      createCaches().canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);

    const params = createRscParams('q=1');
    expect(createRscParams('q=1')).not.toBe(params);
    expect(params.get('query')).toBe('q=1');

    clearCaches();
    expect(getPrefetchedElements(route('/x'))).toBeUndefined();
    expect(
      canReuseStaticRoute(route('/static'), {
        [getRouteSlotId('/static')]: 'page',
      }),
    ).toBe(false);
  });

  it('getPrefetch is undefined after ttl expiry', () => {
    vi.useFakeTimers();
    const caches = createCaches();
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/a'), { ttl: 1000 });
    expect(caches.getPrefetch(route('/a'))).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect(caches.getPrefetch(route('/a'))).toBeUndefined();
  });

  it("mode 'once' skips a stored shell; 'always' dedupes by TTL only", async () => {
    const caches = createCaches();
    await settlePrefetch(caches, '/p', 'q=a', { a: 1 });
    vi.mocked(fetchRsc).mockClear();
    vi.mocked(fetchRsc).mockImplementation(pending);

    caches.prefetchRoute(route('/p', 'q=b'), { mode: 'once' });
    expect(fetchRsc).not.toHaveBeenCalled();

    caches.prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    caches.prefetchRoute(route('/p', 'q=b'), { mode: 'always' });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
  });
});

describe('registered lazy slices', () => {
  afterEach(() => {
    clearCaches();
    clearRegisteredLazySlices();
  });

  it('registration is permanent: ids survive clearCaches', () => {
    registerLazySlice('a');
    registerLazySlice('b');
    clearCaches();
    const ids: string[] = [];
    forEachRegisteredLazySlice((id) => ids.push(id));
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});
