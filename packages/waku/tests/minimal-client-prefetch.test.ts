// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  unstable_fetchRsc,
  unstable_prefetchRsc,
  unstable_withEnhanceFetchFn,
} from '../src/minimal/client.js';

type CallServer = (funcId: string, args: unknown[]) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  createFromFetch:
    vi.fn<
      (
        responsePromise: Promise<Response>,
        options?: { callServer?: CallServer },
      ) => Promise<Record<string, unknown>>
    >(),
  encodeReply:
    vi.fn<(value: unknown) => Promise<string | URLSearchParams | FormData>>(),
  createTemporaryReferenceSet: vi.fn<() => Map<string, unknown>>(),
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: mocks.createFromFetch,
    encodeReply: mocks.encodeReply,
    createTemporaryReferenceSet: mocks.createTemporaryReferenceSet,
  },
}));

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.createFromFetch.mockImplementation(async (responsePromise) => {
    const response = await responsePromise;
    return { _value: null, text: await response.text() };
  });
  mocks.encodeReply.mockResolvedValue('');
  mocks.createTemporaryReferenceSet.mockReturnValue(new Map());
});

afterEach(() => {
  delete (globalThis as any).__WAKU_PREFETCHED__;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('minimal/client prefetch', () => {
  test('prefetch decodes eagerly and reuses decoded elements on fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('prefetched'),
    );
    const enhanceFetchStore = unstable_withEnhanceFetchFn(() => fetchMock);
    const rscParams = new URLSearchParams({ query: 'x=1' });

    unstable_prefetchRsc('R/next.txt', rscParams, enhanceFetchStore);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    const prefetchedResult = mocks.createFromFetch.mock.results[0];
    if (!prefetchedResult || prefetchedResult.type !== 'return') {
      throw new Error('prefetch did not create elements');
    }

    const prefetchedElementsPromise = prefetchedResult.value;
    const navigationElementsPromise = unstable_fetchRsc(
      'R/next.txt',
      rscParams,
      enhanceFetchStore,
    );

    expect(navigationElementsPromise).toBe(prefetchedElementsPromise);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(navigationElementsPromise).resolves.toEqual({
      _value: null,
      text: 'prefetched',
    });
  });

  test('prefetch observes rejected decoded elements until navigation consumes them', async () => {
    const error = new Error('decode failed');
    mocks.createFromFetch.mockReturnValueOnce(Promise.reject(error));
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('ignored'));
    const enhanceFetchStore = unstable_withEnhanceFetchFn(() => fetchMock);
    const rscParams = new URLSearchParams({ query: 'x=2' });

    unstable_prefetchRsc('R/fail.txt', rscParams, enhanceFetchStore);
    await wait();

    await expect(
      unstable_fetchRsc('R/fail.txt', rscParams, enhanceFetchStore),
    ).rejects.toThrow('decode failed');
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
  });

  test('server actions from a prefetched route use the navigation store', async () => {
    // Capture the callServer baked into the prefetch-decoded elements.
    let callServer: CallServer | undefined;
    mocks.createFromFetch.mockImplementation((_responsePromise, options) => {
      callServer ??= options?.callServer;
      return Promise.resolve({ _value: null });
    });

    const prefetchFetch = vi.fn<typeof fetch>(async () => new Response('p'));
    const navFetch = vi.fn<typeof fetch>(async () => new Response('n'));

    unstable_prefetchRsc(
      'R/page.txt',
      undefined,
      unstable_withEnhanceFetchFn(() => prefetchFetch),
    );
    // Navigate with a different store/fetch than the prefetch used.
    await unstable_fetchRsc(
      'R/page.txt',
      undefined,
      unstable_withEnhanceFetchFn(() => navFetch),
    );

    // A server action from the prefetched page must hit the navigation fetch,
    // not the prefetch-time one.
    await callServer!('actions#doThing', []);

    expect(prefetchFetch).toHaveBeenCalledTimes(1); // only the prefetch request
    expect(navFetch).toHaveBeenCalledTimes(1); // the server action request
  });
});
