/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { unstable_fetchRsc as fetchRsc } from '../src/minimal/client.js';
import {
  clearCaches,
  learnStaticFromElements,
  prefetchRoute,
} from '../src/router/client-core-utils/caches.js';
import { load } from '../src/router/client-core-utils/load.js';
import type { LoadOptions } from '../src/router/client-core-utils/load.js';
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

const settled = route('/start');

const baseOpts = (
  overrides: Partial<LoadOptions> & { signal?: AbortSignal } = {},
): LoadOptions => ({
  signal: overrides.signal ?? new AbortController().signal,
  refetch: true,
  has404: false,
  settled,
  base: {},
  url: new URL('http://localhost/next'),
  ...overrides,
});

describe('load', () => {
  beforeEach(() => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  });

  afterEach(() => {
    clearCaches();
    vi.mocked(fetchRsc).mockReset();
    vi.unstubAllEnvs();
  });

  it('does not reuse a static path when base lacks the route slot', async () => {
    learnStaticFromElements({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    });
    const elements = { [ROUTE_ID]: ['/next', ''] };
    vi.mocked(fetchRsc).mockResolvedValue(elements);
    const outcome = await load(route('/next'), baseOpts());
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
      adopted: false,
    });
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('reuses a static path when base already holds the route slot', async () => {
    learnStaticFromElements({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    });
    const outcome = await load(
      route('/next'),
      baseOpts({
        base: { [getRouteSlotId('/next')]: 'page' },
      }),
    );
    expect(outcome).toEqual({
      type: 'reused',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      follows: 0,
    });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('reuses when refetch is false', async () => {
    const outcome = await load(route('/next'), baseOpts({ refetch: false }));
    expect(outcome.type).toBe('reused');
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('fetches by encoded rscPath and returns loaded with adopted false', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    vi.mocked(fetchRsc).mockResolvedValue(elements);
    const outcome = await load(route('/next'), baseOpts());
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        unstable_base: {},
      }),
    );
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
      adopted: false,
    });
  });

  it('omits onBuildIdMismatch so fetchRsc keeps the reload default', async () => {
    vi.mocked(fetchRsc).mockResolvedValue({ [ROUTE_ID]: ['/next', ''] });
    await load(route('/next'), baseOpts());
    const options = vi.mocked(fetchRsc).mock.calls[0]?.[2];
    expect(options && 'onBuildIdMismatch' in options).toBe(false);
  });

  it('forwards onBuildIdMismatch when the caller supplied one', async () => {
    const onBuildIdMismatch = vi.fn();
    vi.mocked(fetchRsc).mockResolvedValue({ [ROUTE_ID]: ['/next', ''] });
    await load(route('/next'), baseOpts({ onBuildIdMismatch }));
    const options = vi.mocked(fetchRsc).mock.calls[0]?.[2];
    expect(options).toEqual(
      expect.objectContaining({
        onBuildIdMismatch: expect.any(Function),
      }),
    );
    options?.onBuildIdMismatch?.();
    expect(onBuildIdMismatch).toHaveBeenCalledWith(
      new URL('http://localhost/next'),
    );
  });

  it('uses an in-flight prefetch instead of fetching again', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    let resolveFetch!: (value: Elements) => void;
    vi.mocked(fetchRsc).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    prefetchRoute(route('/next'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    const pending = load(route('/next'), baseOpts());
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    resolveFetch(elements);
    await expect(pending).resolves.toMatchObject({
      type: 'loaded',
      elements,
      adopted: false,
    });
  });

  it('notifies onInvalidate when a prefetch is dropped', async () => {
    const onInvalidate = vi.fn();
    const controller = new AbortController();
    let invalidate!: () => void;
    vi.mocked(fetchRsc).mockImplementationOnce((_path, _params, options) => {
      invalidate = () =>
        (
          options as { onBuildIdMismatch?: () => void } | undefined
        )?.onBuildIdMismatch?.();
      return new Promise(() => {});
    });
    prefetchRoute(route('/next'));
    const pending = load(
      route('/next'),
      baseOpts({ onInvalidate, signal: controller.signal }),
    );
    invalidate();
    expect(onInvalidate).toHaveBeenCalledWith(new URL('http://localhost/next'));
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
  });

  it('notifies the remaining load when a second adopter of the same prefetch aborts', async () => {
    const onInvalidateA = vi.fn();
    const onInvalidateB = vi.fn();
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    let invalidate!: () => void;
    vi.mocked(fetchRsc).mockImplementationOnce((_path, _params, options) => {
      invalidate = () =>
        (
          options as { onBuildIdMismatch?: () => void } | undefined
        )?.onBuildIdMismatch?.();
      return new Promise(() => {});
    });
    prefetchRoute(route('/next'));
    const pendingA = load(
      route('/next'),
      baseOpts({ onInvalidate: onInvalidateA, signal: controllerA.signal }),
    );
    const pendingB = load(
      route('/next'),
      baseOpts({ onInvalidate: onInvalidateB, signal: controllerB.signal }),
    );
    controllerB.abort();
    await expect(pendingB).resolves.toEqual({ type: 'aborted' });
    invalidate();
    expect(onInvalidateA).toHaveBeenCalledWith(
      new URL('http://localhost/next'),
    );
    expect(onInvalidateB).not.toHaveBeenCalled();
    controllerA.abort();
    await expect(pendingA).resolves.toEqual({ type: 'aborted' });
  });

  it('returns aborted when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await load(
      route('/next'),
      baseOpts({ signal: controller.signal }),
    );
    expect(outcome).toEqual({ type: 'aborted' });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('returns aborted when the fetch is cancelled', async () => {
    const controller = new AbortController();
    vi.mocked(fetchRsc).mockImplementation(
      (_path, _params, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(options.signal!.reason),
          );
        }),
    );
    const pending = load(
      route('/next'),
      baseOpts({ signal: controller.signal }),
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
  });

  it('follows a 404 to /404 when has404 is set', async () => {
    vi.mocked(fetchRsc)
      .mockRejectedValueOnce(createCustomError('nf', { status: 404 }))
      .mockResolvedValueOnce({ [ROUTE_ID]: ['/404', ''] });
    const outcome = await load(
      route('/missing'),
      baseOpts({
        has404: true,
        url: new URL('http://localhost/missing'),
      }),
    );
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/404'),
      follows: 1,
      adopted: false,
    });
    expect(fetchRsc).toHaveBeenCalledTimes(2);
    expect(fetchRsc).toHaveBeenLastCalledWith(
      encodeRoutePath('/404'),
      expect.any(URLSearchParams),
      expect.any(Object),
    );
  });

  it('follows an in-app redirect and loads the target', async () => {
    vi.mocked(fetchRsc)
      .mockRejectedValueOnce(
        createCustomError('moved', {
          status: 307,
          location: `${window.location.origin}/final`,
        }),
      )
      .mockResolvedValueOnce({ [ROUTE_ID]: ['/final', ''] });
    const outcome = await load(
      route('/next'),
      baseOpts({ url: new URL('/next', window.location.href) }),
    );
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/final'),
      follows: 1,
      adopted: false,
    });
  });

  it('leaves the app on an external redirect', async () => {
    const error = createCustomError('gone', {
      location: 'https://other.example/next',
      unstable_leave: true,
    });
    vi.mocked(fetchRsc).mockRejectedValue(error);
    const outcome = await load(route('/next'), baseOpts());
    expect(outcome).toMatchObject({
      type: 'external',
      error,
      route: route('/next'),
      follows: 0,
    });
    if (outcome.type === 'external') {
      expect(outcome.url.href).toBe('https://other.example/next');
      expect(outcome.from.href).toBe('http://localhost/next');
    }
  });

  it('fails on a non-followable error', async () => {
    const error = new Error('boom');
    vi.mocked(fetchRsc).mockRejectedValue(error);
    const outcome = await load(route('/next'), baseOpts());
    expect(outcome).toEqual({
      type: 'failed',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      error,
      follows: 0,
    });
  });

  it('adopts the given promise on the first attempt and does not fetch', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    const outcome = await load(
      route('/next'),
      baseOpts({ adopt: Promise.resolve(elements) }),
    );
    expect(fetchRsc).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
      adopted: true,
    });
  });

  it('follow attempts after an adopted rejection fetch and are not adopted', async () => {
    vi.mocked(fetchRsc).mockResolvedValue({ [ROUTE_ID]: ['/404', ''] });
    const outcome = await load(
      route('/missing'),
      baseOpts({
        has404: true,
        url: new URL('http://localhost/missing'),
        adopt: Promise.reject(createCustomError('nf', { status: 404 })),
      }),
    );
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/404'),
      follows: 1,
      adopted: false,
    });
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath('/404'),
      expect.any(URLSearchParams),
      expect.any(Object),
    );
  });

  it('an aborted adopt is aborted, not failed', async () => {
    const controller = new AbortController();
    const adopt = new Promise<Elements>(() => {});
    const pending = load(
      route('/next'),
      baseOpts({ adopt, signal: controller.signal }),
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('loaded.route is the requested attempt, not the response ROUTE_ID', async () => {
    vi.mocked(fetchRsc).mockResolvedValue({ [ROUTE_ID]: ['/other', ''] });
    const outcome = await load(route('/next'), baseOpts());
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/next'),
    });
  });
});
