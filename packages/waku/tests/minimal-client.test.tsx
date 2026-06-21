// @vitest-environment happy-dom

import { Suspense, act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  Root,
  Slot,
  unstable_callServerRsc,
  unstable_fetchRsc,
  unstable_prefetchRsc,
  unstable_registerCallServerElementsListener,
  unstable_registerFetchEnhancer,
  unstable_registerFetchRscInputTransformer,
  useFetchRscStore_UNSTABLE,
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

const resolvedThenable = <T,>(value: T): Promise<T> =>
  Object.assign(Promise.resolve(value), {
    status: 'fulfilled' as const,
    value,
  });

// The client store is a module singleton; capture it to reset between tests.
const clientStore = (() => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return useFetchRscStore_UNSTABLE() as unknown as Record<string, unknown>;
  } finally {
    console.warn = warn;
  }
})();

const track = <T,>(unregister: T): T => unregister;

const stubFetch = () =>
  unstable_registerFetchEnhancer(
    () => async () => new Response('{}', { status: 200 }),
  );

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  mocks.createFromFetch.mockReset();
  mocks.createFromFetch.mockImplementation(async (responsePromise) => {
    const response = await responsePromise;
    return { _value: null, text: await response.text() };
  });
  mocks.encodeReply.mockResolvedValue('');
  mocks.createTemporaryReferenceSet.mockReturnValue(new Map());
});

afterEach(() => {
  for (const key of Object.keys(clientStore)) {
    delete clientStore[key];
  }
  delete (globalThis as any).__WAKU_PREFETCHED__;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('minimal/client prefetch', () => {
  test('prefetch decodes eagerly and reuses decoded elements on fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('prefetched'),
    );
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=1' });

    unstable_prefetchRsc('R/next.txt', rscParams);

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
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=2' });

    unstable_prefetchRsc('R/fail.txt', rscParams);
    await wait();

    await expect(unstable_fetchRsc('R/fail.txt', rscParams)).rejects.toThrow(
      'decode failed',
    );
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
  });

  test('server actions from a prefetched route use the current fetch', async () => {
    // Capture the callServer baked into the prefetch-decoded elements.
    let callServer: CallServer | undefined;
    mocks.createFromFetch.mockImplementation((_responsePromise, options) => {
      callServer ??= options?.callServer;
      return Promise.resolve({ _value: null });
    });

    const prefetchFetch = vi.fn<typeof fetch>(async () => new Response('p'));
    const actionFetch = vi.fn<typeof fetch>(async () => new Response('n'));

    // Prefetch with one fetch...
    const unregisterPrefetch = unstable_registerFetchEnhancer(
      () => prefetchFetch,
    );
    unstable_prefetchRsc('R/page.txt', undefined);
    unregisterPrefetch();
    // ...then the app registers a different fetch before consuming the prefetch.
    track(unstable_registerFetchEnhancer(() => actionFetch));
    await unstable_fetchRsc('R/page.txt', undefined);

    // A server action from the prefetched page must use the currently
    // registered fetch, since there is a single shared store.
    await callServer!('actions#doThing', []);

    expect(prefetchFetch).toHaveBeenCalledTimes(1); // only the prefetch request
    expect(actionFetch).toHaveBeenCalledTimes(1); // the server action request
  });
});

describe('minimal/client server actions', () => {
  test('returned elements re-render the tree and notify listeners', async () => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ App: 'A' }));
    stubFetch();
    const listener = vi.fn();
    track(unstable_registerCallServerElementsListener(listener));

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="App" />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('A');

    // A server action returns an updated slot and a return value.
    mocks.createFromFetch.mockResolvedValueOnce({ _value: 'result', App: 'B' });
    let value: unknown;
    await act(async () => {
      value = await unstable_callServerRsc('actions#do', []);
    });

    expect(value).toBe('result');
    expect(container.textContent).toBe('B');
    expect(listener).toHaveBeenCalledWith({ App: 'B' });

    act(() => root.unmount());
  });

  test('a server action returning elements throws when no Root is mounted', async () => {
    // The merge must fail loudly (not silently drop) when there is no
    // `SET_ELEMENTS` bridge, so timing/wiring bugs surface.
    mocks.createFromFetch.mockResolvedValueOnce({ _value: 'v', foo: 'FOO' });
    stubFetch();

    await expect(unstable_callServerRsc('actions#do', [])).rejects.toThrow(
      'Missing Root',
    );
  });

  test('a server action from a consumed prefetched tree updates the active Root', async () => {
    // The old per-Root store rebound a prefetched tree's actions to the
    // consuming store; with a single store, the action must still update the
    // mounted Root.
    let callServer: CallServer | undefined;
    mocks.createFromFetch.mockImplementation((_responsePromise, options) => {
      callServer ??= options?.callServer;
      return resolvedThenable({ App: 'prefetched' });
    });
    stubFetch();
    unstable_prefetchRsc('R/page.txt', undefined);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/page.txt">
          <Suspense fallback={null}>
            <Slot id="App" />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('prefetched');

    mocks.createFromFetch.mockResolvedValueOnce({
      _value: 'ok',
      App: 'updated',
    });
    let value: unknown;
    await act(async () => {
      value = await callServer!('actions#do', []);
    });

    expect(value).toBe('ok');
    expect(container.textContent).toBe('updated');

    act(() => root.unmount());
  });
});

describe('minimal/client build id mismatch', () => {
  test('a stale build id triggers the provided handler', async () => {
    vi.stubEnv('WAKU_BUILD_ID', 'build-1');
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: null,
      _buildId: 'build-2',
    });
    stubFetch();
    const onBuildIdMismatch = vi.fn();

    await unstable_fetchRsc('R/x.txt', undefined, { onBuildIdMismatch });
    await wait();

    expect(onBuildIdMismatch).toHaveBeenCalledTimes(1);
  });

  test('a matching build id does not trigger the handler', async () => {
    vi.stubEnv('WAKU_BUILD_ID', 'build-1');
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: null,
      _buildId: 'build-1',
    });
    stubFetch();
    const onBuildIdMismatch = vi.fn();

    await unstable_fetchRsc('R/y.txt', undefined, { onBuildIdMismatch });
    await wait();

    expect(onBuildIdMismatch).not.toHaveBeenCalled();
  });
});

describe('minimal/client input transformer', () => {
  // Consumed by waku-jotai to inject atom values into rscParams.
  test('a registered transformer rewrites the fetch input', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}'));
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const transform = vi.fn(
      (_rscPath: string, _rscParams: unknown, prefetchOnly: boolean) =>
        ['R/rewritten.txt', { x: 1 }, prefetchOnly] as const,
    );
    track(unstable_registerFetchRscInputTransformer(transform));

    await unstable_fetchRsc('R/original.txt', undefined);

    expect(transform).toHaveBeenCalledWith('R/original.txt', undefined, false);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('rewritten');
  });

  test('the deprecated (store, transformer) form still works and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}'));
      track(unstable_registerFetchEnhancer(() => fetchMock));
      const transform = vi.fn(
        (_rscPath: string, _rscParams: unknown, prefetchOnly: boolean) =>
          ['R/legacy.txt', undefined, prefetchOnly] as const,
      );
      track(
        unstable_registerFetchRscInputTransformer(
          useFetchRscStore_UNSTABLE(),
          transform,
        ),
      );

      await unstable_fetchRsc('R/orig2.txt', undefined);

      expect(transform).toHaveBeenCalled();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('legacy');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
