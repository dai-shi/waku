// @vitest-environment happy-dom

import { StrictMode, Suspense, act, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { fetchRscStore } from '../src/minimal/client-utils/fetch-store.js';
import {
  clearInitialRscEntries,
  getInitialRscEntry,
} from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  clearRootCachedEtags,
  registerRootStore,
} from '../src/minimal/client-utils/root-store.js';
import type { CallServerElementsListener } from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_callServerRsc,
  unstable_fetchRsc,
  unstable_registerCallServerElementsListener,
  unstable_registerFetchEnhancer,
  unstable_registerFetchRscInputTransformer,
  useElementsPromise_UNSTABLE,
  useMergeElements_UNSTABLE,
  useRegisterCallServerElementsListener_UNSTABLE,
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

const useRefetch = () => {
  const mergeElements = useMergeElements_UNSTABLE();
  return (
    rscPath: string,
    rscParams?: unknown,
    options?: Parameters<typeof mergeElements>[1],
  ) =>
    mergeElements(
      unstable_fetchRsc(rscPath, rscParams, {
        ...(options?.unstable_swr?.base
          ? { unstable_base: options.unstable_swr.base }
          : {}),
      }),
      options,
    );
};

type Refetch = ReturnType<typeof useRefetch>;

// The client store is a module singleton; reset it between tests.
const clientStore = fetchRscStore as unknown as Record<string, unknown>;

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
  clearInitialRscEntries();
  delete (globalThis as any).__WAKU_PREFETCHED__;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('minimal/client fetch', () => {
  test('unstable_fetchRsc returns fetched elements', async () => {
    // Minimal only fetches + decodes and hands the promise back to the caller.
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('prefetched'),
    );
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=1' });

    const elements = await unstable_fetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    expect(elements).toEqual({ _value: null, text: 'prefetched' });
  });

  test('each fetch issues a new request for the same input', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('x'));
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=1' });

    await unstable_fetchRsc('R/next.txt', rscParams);
    await unstable_fetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
  });

  test('Root releases its initial fetch after committing', async () => {
    mocks.createFromFetch.mockReturnValue(
      resolvedThenable({ _value: null, App: 'app' }),
    );
    stubFetch();
    const rscParams = { value: 1 };
    const render = async () => {
      const root = createRoot(document.createElement('div'));
      await act(async () => {
        root.render(
          <StrictMode>
            <Root initialRscPath="R/app.txt" initialRscParams={rscParams}>
              <Suspense fallback={null}>
                <Slot id="App" />
              </Suspense>
            </Root>
          </StrictMode>,
        );
      });
      return root;
    };

    const firstRoot = await render();
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    act(() => firstRoot.unmount());

    const secondRoot = await render();
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
    act(() => secondRoot.unmount());
  });

  test('bounds uncommitted initial fetches', () => {
    const first = getInitialRscEntry('0', undefined, () => Promise.resolve({}));
    for (let index = 1; index <= 32; index += 1) {
      void getInitialRscEntry(String(index), undefined, () =>
        Promise.resolve({}),
      );
    }
    const create = vi.fn(() => Promise.resolve({}));

    expect(getInitialRscEntry('0', undefined, create)).not.toBe(first);
    expect(create).toHaveBeenCalledOnce();
  });

  test('retries a rejected initial fetch', async () => {
    const first = getInitialRscEntry('R/app.txt', undefined, () =>
      Promise.reject(new Error('failed')),
    );
    await expect(first).rejects.toThrow('failed');
    const create = vi.fn(() => Promise.resolve({}));

    expect(getInitialRscEntry('R/app.txt', undefined, create)).not.toBe(first);
    expect(create).toHaveBeenCalledOnce();
  });

  test('server actions use the current fetch, not the one elements decoded with', async () => {
    // Capture the callServer baked into the fetched elements.
    let callServer: CallServer | undefined;
    mocks.createFromFetch.mockImplementation((_responsePromise, options) => {
      callServer ??= options?.callServer;
      return Promise.resolve({ _value: null });
    });

    const prefetchFetch = vi.fn<typeof fetch>(async () => new Response('p'));
    const actionFetch = vi.fn<typeof fetch>(async () => new Response('n'));

    // Fetch elements with one fetch...
    const unregisterPrefetch = unstable_registerFetchEnhancer(
      () => prefetchFetch,
    );
    await unstable_fetchRsc('R/page.txt');
    unregisterPrefetch();
    // ...then the app registers a different fetch.
    track(unstable_registerFetchEnhancer(() => actionFetch));

    // A server action must use the currently registered fetch: the callServer
    // closure does not pin the fetch the prefetch was decoded with.
    await callServer!('actions#doThing', []);

    expect(prefetchFetch).toHaveBeenCalledTimes(1); // only the prefetch request
    expect(actionFetch).toHaveBeenCalledTimes(1); // the server action request
  });
});

describe('minimal/client transport failures', () => {
  const redirectedResponse = (url: string) =>
    ({
      redirected: true,
      url,
      ok: true,
      status: 200,
      text: async () => 'the payload',
    }) as unknown as Response;

  test('a redirect within the rsc endpoint is decoded as the payload', async () => {
    track(
      unstable_registerFetchEnhancer(
        () => async () =>
          redirectedResponse(`${window.location.origin}/RSC/R/exists.txt`),
      ),
    );

    // decoded from the response the redirect landed on
    await expect(unstable_fetchRsc('R/redirect.txt')).resolves.toMatchObject({
      text: 'the payload',
    });
  });

  test('a redirect the fetch did not follow is reported as a status', async () => {
    track(
      unstable_registerFetchEnhancer(
        () => async () =>
          ({
            redirected: false,
            url: `${window.location.origin}/RSC/R/next.txt`,
            ok: false,
            status: 307,
            statusText: 'Temporary Redirect',
            headers: new Headers({ location: '/login' }),
            text: async () => '',
          }) as unknown as Response,
      ),
    );

    const error = await unstable_fetchRsc('R/next.txt').catch(
      (e: unknown) => e,
    );

    // waku never reads Location, so a fetch enhancer using redirect: 'manual'
    // is not supported. Decided 2026-07-30; revisit with a real use case.
    expect(getErrorInfo(error)).toEqual({ status: 307 });
  });

  test('a redirected response is decoded like any other', async () => {
    // where the response came from does not matter, only what it carries
    const url = 'https://login.example/anywhere';
    track(
      unstable_registerFetchEnhancer(() => async () => redirectedResponse(url)),
    );
    mocks.createFromFetch.mockResolvedValueOnce({ App: 'ok' });

    await expect(unstable_fetchRsc('R/next.txt')).resolves.toEqual({
      App: 'ok',
    });
  });

  test('a network error is marked as such', async () => {
    track(
      unstable_registerFetchEnhancer(() => () => {
        return Promise.reject(new TypeError('Failed to fetch'));
      }),
    );

    const error = await unstable_fetchRsc('R/next.txt').catch(
      (e: unknown) => e,
    );

    expect(getErrorInfo(error)).toEqual({ unstable_networkError: true });
    expect((error as Error).message).toBe('Failed to fetch');
  });

  test('any other failure passes through untouched', async () => {
    const unregisterAbort = unstable_registerFetchEnhancer(() => () => {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    const aborted = await unstable_fetchRsc('R/next.txt').catch(
      (e: unknown) => e,
    );
    unregisterAbort();

    expect((aborted as Error).name).toBe('AbortError');
    expect(getErrorInfo(aborted)).toBeNull();

    // an app's own failure (a fetch enhancer, an unserializable argument)
    // reaches the caller as it is
    const appError = new Error('could not serialize');
    track(
      unstable_registerFetchEnhancer(() => () => {
        return Promise.reject(appError);
      }),
    );
    const thrown = await unstable_fetchRsc('R/other.txt').catch(
      (e: unknown) => e,
    );

    expect(thrown).toBe(appError);
  });
});

describe('minimal/client server actions', () => {
  test('returned elements re-render the tree and notify listeners', async () => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ App: 'A' }));
    stubFetch();
    const listener = vi.fn();
    const rootListener = vi.fn();
    track(unstable_registerCallServerElementsListener(listener));
    const Listener = () => {
      const register = useRegisterCallServerElementsListener_UNSTABLE();
      useEffect(() => register(rootListener), [register]);
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Listener />
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
    expect(rootListener).toHaveBeenCalledWith({ App: 'B' });

    act(() => root.unmount());
  });

  test('a document location is reported as an error, not merged', async () => {
    // minimal only tags it; deciding what a location means is the router's
    mocks.createFromFetch.mockResolvedValueOnce({
      _location: 'https://other.example/next',
    });
    stubFetch();

    const error = await unstable_fetchRsc('R/next.txt').catch(
      (e: unknown) => e,
    );

    expect(getErrorInfo(error)).toEqual({
      location: 'https://other.example/next',
      unstable_leave: true,
    });
  });

  test('a server action returning elements throws when no Root is mounted', async () => {
    // The merge must fail loudly (not silently drop) when there is no
    // default Root bridge, so timing/wiring bugs surface.
    mocks.createFromFetch.mockResolvedValueOnce({ _value: 'v', foo: 'FOO' });
    stubFetch();

    await expect(unstable_callServerRsc('actions#do', [])).rejects.toThrow(
      'Server action returned elements without a mounted Root component',
    );
  });

  test('an action response and listeners target its request-time Root', async () => {
    let resolveAction: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    stubFetch();
    const firstSetElements = vi.fn();
    const secondSetElements = vi.fn();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unregisterFirst = registerRootStore({
      setElements: firstSetElements,
      etags: { App: 'first' },
      listeners: new Set([firstListener]),
    });

    const action = unstable_callServerRsc('actions#do', []);
    const unregisterSecond = registerRootStore({
      setElements: secondSetElements,
      etags: { App: 'second' },
      listeners: new Set([secondListener]),
    });
    resolveAction({ _value: 'result', App: 'updated' });

    try {
      await expect(action).resolves.toBe('result');
      expect(firstSetElements).toHaveBeenCalledOnce();
      expect(secondSetElements).not.toHaveBeenCalled();
      expect(firstListener).toHaveBeenCalledOnce();
      expect(secondListener).not.toHaveBeenCalled();
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });

  test('an action response is not retargeted after its Root unmounts', async () => {
    let resolveAction: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    stubFetch();
    const firstSetElements = vi.fn();
    const secondSetElements = vi.fn();
    const unregisterFirst = registerRootStore({
      setElements: firstSetElements,
      etags: { App: 'first' },
      listeners: new Set(),
    });

    const action = unstable_callServerRsc('actions#do', []);
    unregisterFirst();
    const unregisterSecond = registerRootStore({
      setElements: secondSetElements,
      etags: { App: 'second' },
      listeners: new Set(),
    });
    resolveAction({ _value: 'result', App: 'updated' });

    try {
      await expect(action).resolves.toBe('result');
      expect(firstSetElements).toHaveBeenCalledOnce();
      expect(secondSetElements).not.toHaveBeenCalled();
    } finally {
      unregisterSecond();
    }
  });

  test('HMR clears cached etags from every mounted Root', () => {
    const first = {
      setElements: vi.fn(),
      etags: { App: 'first' },
      listeners: new Set<CallServerElementsListener>(),
    };
    const second = {
      setElements: vi.fn(),
      etags: { App: 'second' },
      listeners: new Set<CallServerElementsListener>(),
    };
    const unregisterFirst = registerRootStore(first);
    const unregisterSecond = registerRootStore(second);

    try {
      clearRootCachedEtags();
      expect(first.etags).toEqual({});
      expect(second.etags).toEqual({});
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });

  test('a descendant mount effect can call a server action', async () => {
    mocks.createFromFetch
      .mockResolvedValueOnce({ _value: null })
      .mockResolvedValueOnce({ _value: 'result', App: 'updated' });
    stubFetch();
    let action: Promise<unknown> | undefined;
    const ActionOnMount = () => {
      useEffect(() => {
        action = unstable_callServerRsc('actions#do', []);
        void action.catch(() => {});
      }, []);
      return null;
    };
    const root = createRoot(document.createElement('div'));

    try {
      await act(async () => {
        root.render(
          <Root>
            <ActionOnMount />
          </Root>,
        );
      });
      await expect(action).resolves.toBe('result');
    } finally {
      act(() => root.unmount());
    }
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
      (_rscPath: string, _rscParams: unknown) =>
        ['R/rewritten.txt', { x: 1 }] as const,
    );
    track(unstable_registerFetchRscInputTransformer(transform));

    await unstable_fetchRsc('R/original.txt', undefined);

    expect(transform).toHaveBeenCalledOnce();
    expect(transform.mock.calls[0]?.slice(0, 2)).toEqual([
      'R/original.txt',
      undefined,
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('rewritten');
  });
});

describe('minimal/client eager merge', () => {
  test('keeps a slot that b introduces but a never had', async () => {
    // Cached a: a slot resolved eagerly + a slot resolved lazily. No `extra`.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, cached: 'C', dynamic: 'D1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      const refetchValue = useRefetch();
      const [extra, setExtra] = useState(false);
      useEffect(() => {
        refetch = refetchValue;
        mountExtra = () => setExtra(true);
      });
      return extra ? <Slot id="extra" /> : null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="cached" />
            <Slot id="dynamic" />
            <Probe />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('CD1');

    // Optimistic refetch: b refreshes the lazy slot AND introduces `extra`, a
    // key the eager merge must not drop (e.g. a redirect target's slot).
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ dynamic: 'D2', extra: 'X' }),
    );
    const unstable_isEager = (key: string | symbol) => key === 'cached';
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: unstable_isEager },
      });
    });
    await act(async () => {
      mountExtra();
    });

    // cached slot from a, dynamic streamed fresh, and the brand-new `extra`
    expect(container.textContent).toBe('CD2X');

    act(() => root.unmount());
  });

  test('a slot only b introduces is mountable as soon as refetch resolves', async () => {
    // The router's redirect reconcile switches the route in the refetch
    // continuation, rendering a slot only the response carries. The elements
    // state must already contain it by then (commit-2 before resolution).
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, cached: 'C' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      const refetchValue = useRefetch();
      const [extra, setExtra] = useState(false);
      useEffect(() => {
        refetch = refetchValue;
        mountExtra = () => setExtra(true);
      });
      return extra ? <Slot id="extra" /> : null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="cached" />
            <Probe />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('C');

    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ extra: 'X' }));
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'cached' },
      }).then(() => {
        // synchronously in the continuation, like the redirect handler
        mountExtra();
      });
    });

    expect(container.textContent).toBe('CX');

    act(() => root.unmount());
  });

  test('serves an isSwr key from a even when b has a fresh value', async () => {
    // isSwr pins the slot to its cached value from `a` (the eager merge);
    // only non-isSwr holes stream from `b`. Separate Suspense boundaries let
    // us observe the pinned eager value while the hole streams.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', hole: 'H1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      useEffect(() => {
        refetch = refetchValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="eager" />
          </Suspense>
          <Suspense fallback={<span>L</span>}>
            <Slot id="hole" />
          </Suspense>
          <Probe />
        </Root>,
      );
    });
    expect(container.textContent).toBe('A1H1');

    // b refreshes BOTH keys; defer it to observe the stale-then-swap.
    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    const isSwr = (key: string | symbol) => key === 'eager';
    await act(async () => {
      void refetch!('R/next.txt', undefined, { unstable_swr: { pin: isSwr } });
    });

    // eager shows its cached A1 instantly; the hole suspends.
    expect(container.textContent).toBe('A1L');

    await act(async () => {
      resolveB({ eager: 'A2', hole: 'H2' });
      await wait();
    });

    // the eager key stays A1 (pinned to a); the hole streams b's H2.
    expect(container.textContent).toBe('A1H2');

    act(() => root.unmount());
  });

  test('skips the second commit when b introduces no new keys', async () => {
    // The common case: every response key was already delivered by the eager
    // merge, so commit-2 bails out (same promise, same map) and nothing is
    // re-rendered through a second commit.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', hole: 'H1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    let refetched: Promise<unknown> | undefined;
    await act(async () => {
      refetched = refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'eager' },
      });
    });
    const midPromise = elementsPromise!;
    const midElements = await midPromise;
    const holeThenable = midElements.hole;

    await act(async () => {
      resolveB({ eager: 'A2', hole: 'H2' });
      await refetched;
    });

    expect(elementsPromise).toBe(midPromise);
    const finalElements = await elementsPromise!;
    expect(finalElements).toBe(midElements);
    expect(finalElements.hole).toBe(holeThenable);
    expect(finalElements.eager).toBe('A1');
    await expect(finalElements.hole).resolves.toBe('H2');

    act(() => root.unmount());
  });

  test('an overlay lands with the response it came with', async () => {
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, page: 'A' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ page: 'B' }));
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_overlay: { nav: 'from the client' },
      });
    });

    const merged = await elementsPromise!;
    expect(merged.page).toBe('B');
    expect(merged.nav).toBe('from the client');

    act(() => root.unmount());
  });

  test('an overlay is dropped when the response fails', async () => {
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, page: 'A' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    mocks.createFromFetch.mockRejectedValueOnce(new Error('rejected'));
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_overlay: { nav: 'from the client' },
      }).catch(() => {});
    });

    const merged = await elementsPromise!;
    expect(merged.page).toBe('A');
    expect('nav' in merged).toBe(false);

    act(() => root.unmount());
  });

  test('an overlay key takes the response value once it lands', async () => {
    // How the router keeps pinned meta fresh: a pinned key is never refreshed,
    // so the keys it needs current ride in the overlay instead.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({
        _value: null,
        ROUTE: ['/start', ''],
        IS_STATIC: false,
      }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    let refetched: Promise<unknown> | undefined;
    await act(async () => {
      refetched = refetch!('R/next.txt', undefined, {
        unstable_overlay: { ROUTE: ['/next', 'x=1'], IS_STATIC: false },
        unstable_swr: {
          pin: (key) => key === 'ROUTE' || key === 'IS_STATIC',
        },
      });
    });
    // the eager commit paints the overlay
    expect((await elementsPromise!).ROUTE).toEqual(['/next', 'x=1']);

    await act(async () => {
      resolveB({ ROUTE: ['/next', ''], IS_STATIC: true });
      await refetched;
    });

    const finalElements = await elementsPromise!;
    expect(finalElements.ROUTE).toEqual(['/next', '']);
    expect(finalElements.IS_STATIC).toBe(true);

    act(() => root.unmount());
  });

  test('merges new keys even while the previous elements are still streaming', async () => {
    // The response can resolve before the previous elements do. The second
    // commit cannot inspect a pending state synchronously, so it chains on
    // it instead; this is safe because a pending state has never rendered.
    let resolveInitial: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveInitial = resolve;
      }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="eager" />
            <Slot id="hole" />
          </Suspense>
          <Probe />
        </Root>,
      );
    });

    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ eager: 'A2', hole: 'H2', extra: 'X' }),
    );
    let refetched: unknown;
    await act(async () => {
      refetched = await refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'eager' },
      });
    });
    expect(refetched).toEqual({ eager: 'A2', hole: 'H2', extra: 'X' });

    await act(async () => {
      resolveInitial({ _value: null, eager: 'A1', hole: 'H1' });
    });

    expect(container.textContent).toBe('A1H2');
    const finalElements = await elementsPromise!;
    expect(finalElements.eager).toBe('A1');
    expect(finalElements.extra).toBe('X');
    await expect(finalElements.hole).resolves.toBe('H2');

    act(() => root.unmount());
  });

  test('an overlapping key falls back to the base when the response omits it', async () => {
    // The base's etag is what rides the request for keys the base holds, so
    // an omission proves the base copy current: the fallback must serve the
    // base copy, not a possibly older live one.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', shared: 'LIVE' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="eager" />
            <Slot id="shared" />
          </Suspense>
          <Probe />
        </Root>,
      );
    });
    expect(container.textContent).toBe('A1LIVE');

    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({}));
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_swr: {
          pin: (key) => key === 'eager',
          base: { shared: 'BASE' },
        },
      });
    });

    expect(container.textContent).toBe('A1BASE');
    const finalElements = await elementsPromise!;
    await expect(finalElements.shared).resolves.toBe('BASE');

    act(() => root.unmount());
  });

  test('a superseded refetch does not commit onto the newer state', async () => {
    // If another refetch commits between the eager merge and the response,
    // the stale response's second commit must leave the newer state as is:
    // grafting onto it would re-render it and plant stale keys.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', hole: 'H1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    let resolveB1: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB1 = resolve;
      }),
    );
    let refetched1: Promise<unknown> | undefined;
    await act(async () => {
      refetched1 = refetch!('R/first.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'eager' },
      });
    });

    let resolveB2: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB2 = resolve;
      }),
    );
    let refetched2: Promise<unknown> | undefined;
    await act(async () => {
      refetched2 = refetch!('R/second.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'eager' },
      });
    });
    const midPromise = elementsPromise!;

    // the superseded response resolves with a key the state has never seen
    await act(async () => {
      resolveB1({ hole: 'H1x', stale: 'S' });
      await refetched1;
    });
    expect(elementsPromise).toBe(midPromise);
    const midElements = await elementsPromise!;
    expect('stale' in midElements).toBe(false);

    await act(async () => {
      resolveB2({ hole: 'H2', fresh: 'F' });
      await refetched2;
    });
    const finalElements = await elementsPromise!;
    expect('stale' in finalElements).toBe(false);
    expect(finalElements.fresh).toBe('F');
    await expect(finalElements.hole).resolves.toBe('H2');

    act(() => root.unmount());
  });

  test('merges keys only b introduces in a second commit', async () => {
    // The rare case (e.g. a rerendered route's elements): commit-2 adds the
    // new keys while every already-delivered key keeps its exact value.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', hole: 'H1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      const refetchValue = useRefetch();
      const elementsPromiseValue = useElementsPromise_UNSTABLE();
      useEffect(() => {
        refetch = refetchValue;
        elementsPromise = elementsPromiseValue;
      });
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Probe />
        </Root>,
      );
    });

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    let refetched: Promise<unknown> | undefined;
    await act(async () => {
      refetched = refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'eager' },
      });
    });
    const midElements = await elementsPromise!;
    const holeThenable = midElements.hole;

    await act(async () => {
      resolveB({ eager: 'A2', hole: 'H2', extra: 'X' });
      await refetched;
    });
    const finalElements = await elementsPromise!;

    expect(finalElements).not.toBe(midElements);
    expect(finalElements.hole).toBe(holeThenable);
    expect(finalElements.eager).toBe('A1');
    expect(finalElements.extra).toBe('X');
    expect('extra' in midElements).toBe(false);
    await expect(finalElements.hole).resolves.toBe('H2');

    act(() => root.unmount());
  });

  test('a base serves pinned keys and falls back for keys the response omits', async () => {
    // A base (e.g. a stored prefetched response) joins the merge like extra
    // previous elements: immutable keys pin immediately, the rest become
    // holes on the response and fall back to the base value only when the
    // server omits the key, which the etag protocol guarantees means
    // unchanged.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, cached: 'C', dynamic: 'D1' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      const refetchValue = useRefetch();
      const [extra, setExtra] = useState(false);
      useEffect(() => {
        refetch = refetchValue;
        mountExtra = () => setExtra(true);
      });
      return extra ? (
        <>
          <Suspense fallback={<span>[S]</span>}>
            <Slot id="shell" />
          </Suspense>
          <Suspense fallback={<span>[K]</span>}>
            <Slot id="kept" />
          </Suspense>
          <Suspense fallback={<span>[L]</span>}>
            <Slot id="lazy" />
          </Suspense>
        </>
      ) : null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="cached" />
          </Suspense>
          <Suspense fallback={<span>[D]</span>}>
            <Slot id="dynamic" />
          </Suspense>
          <Probe />
        </Root>,
      );
    });
    expect(container.textContent).toBe('CD1');

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    let refetched: Promise<unknown> | undefined;
    await act(async () => {
      refetched = refetch!('R/next.txt', undefined, {
        unstable_swr: {
          // the pin predicate governs previous elements only: shell pins
          // because the base proves it immutable, not because of this
          pin: (key) => key === 'cached',
          base: {
            cached: 'STALE',
            shell: 'S',
            [`${ETAG_ID_PREFIX}shell`]: IMMUTABLE_ETAG,
            kept: 'K',
            lazy: 'STALE',
          },
        },
      });
      mountExtra();
    });
    // pinned: cached from prev (not the base), shell from the base;
    // holes: dynamic, kept and lazy suspend on the response
    expect(container.textContent).toBe('C[D]S[K][L]');

    await act(async () => {
      resolveB({ dynamic: 'D2', lazy: 'L' });
      await refetched;
    });
    // the response wins where it has the key; the base fills the omission
    expect(container.textContent).toBe('CD2SKL');
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });

  test('an isSwr refetch works with decode promises whose then() returns undefined', async () => {
    // react-server-dom decode promises are flight Chunks: then() registers
    // callbacks but returns undefined, so they must never be chained directly.
    const chunkLike = <T,>(value: T): Promise<T> => {
      const p = Promise.resolve(value);
      return {
        then: (f: (v: T) => unknown, r?: (e: unknown) => unknown) => {
          void p.then(f, r);
        },
      } as unknown as Promise<T>;
    };
    mocks.createFromFetch.mockReturnValueOnce(
      chunkLike({ _value: null, cached: 'C' }),
    );
    stubFetch();

    let refetch: Refetch | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      const refetchValue = useRefetch();
      const [extra, setExtra] = useState(false);
      useEffect(() => {
        refetch = refetchValue;
        mountExtra = () => setExtra(true);
      });
      return extra ? <Slot id="extra" /> : null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="cached" />
            <Probe />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('C');

    mocks.createFromFetch.mockReturnValueOnce(chunkLike({ extra: 'X' }));
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_swr: { pin: (key) => key === 'cached' },
      }).then(() => {
        mountExtra();
      });
    });

    expect(container.textContent).toBe('CX');

    act(() => root.unmount());
  });
});

describe('minimal/client refetch scenarios', () => {
  // No-router scenario tests for refetch's merge behavior.
  const mount = async (
    initial: Record<string, unknown>,
    ui: (refetchRef: { current?: Refetch }) => ReactNode,
  ) => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable(initial));
    stubFetch();
    const refetchRef: { current?: Refetch } = {};
    const Probe = () => {
      const refetch = useRefetch();
      useEffect(() => {
        refetchRef.current = refetch;
      });
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          {ui(refetchRef)}
          <Probe />
        </Root>,
      );
    });
    return {
      container,
      refetch: () => refetchRef.current!,
      unmount: () => act(() => root.unmount()),
    };
  };

  test('suspend: a default slot suspends on b, then shows b', async () => {
    const view = await mount({ _value: null, main: 'M1' }, () => (
      <Suspense fallback={<span>loading</span>}>
        <Slot id="main" />
      </Suspense>
    ));
    expect(view.container.textContent).toBe('M1');

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    await act(async () => {
      void view.refetch()('R/next.txt', undefined, {});
    });
    expect(view.container.textContent).toBe('loading');

    await act(async () => {
      resolveB({ main: 'M2' });
      await wait();
    });
    expect(view.container.textContent).toBe('M2');

    view.unmount();
  });

  // createFromFetch says it returns a promise, but hands back a pending
  // thenable whose `then` returns nothing
  const pendingThenable = (value: Record<string, unknown>) => {
    const resolvers: ((v: Record<string, unknown>) => void)[] = [];
    return {
      thenable: {
        then(resolve: (v: Record<string, unknown>) => void) {
          resolvers.push(resolve);
        },
      } as unknown as Promise<Record<string, unknown>>,
      settle: () => resolvers.forEach((resolve) => resolve(value)),
    };
  };

  test('a decoded payload comes back chainable, not as react gave it', async () => {
    const { thenable, settle } = pendingThenable({ _value: null, page: 'P2' });
    mocks.createFromFetch.mockReturnValue(thenable);
    track(stubFetch());

    // a thenable would return undefined from then, so this would throw
    const chained = unstable_fetchRsc('R/next.txt')
      .then((elements) => elements)
      .finally(() => {});
    await wait();
    settle();

    await expect(chained).resolves.toMatchObject({ page: 'P2' });
  });

  test('new key: a slot b introduces suspends, then shows b', async () => {
    let mountExtra = () => {};
    const view = await mount({ _value: null, main: 'M1' }, (ref) => {
      const Holder = () => {
        const refetch = useRefetch();
        const [extra, setExtra] = useState(false);
        useEffect(() => {
          ref.current = refetch;
          mountExtra = () => setExtra(true);
        });
        return extra ? (
          <Suspense fallback={<span>loading</span>}>
            <Slot id="extra" />
          </Suspense>
        ) : null;
      };
      return <Holder />;
    });
    expect(view.container.textContent).toBe('');

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    await act(async () => {
      void view.refetch()('R/next.txt', undefined, {});
    });
    await act(async () => {
      mountExtra();
    });
    // `extra` is not in a; the merged map suspends on b until it arrives.
    expect(view.container.textContent).toBe('loading');

    await act(async () => {
      resolveB({ main: 'M1', extra: 'X' });
      await wait();
    });
    expect(view.container.textContent).toBe('X');

    view.unmount();
  });

  test('hold on omit: keeps a slot a had when b omits it', async () => {
    const view = await mount(
      { _value: null, kept: 'K1', changed: 'C1' },
      () => (
        <Suspense fallback={null}>
          <Slot id="kept" />
          <Slot id="changed" />
        </Suspense>
      ),
    );
    expect(view.container.textContent).toBe('K1C1');

    // b omits `kept` and refreshes `changed`.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ changed: 'C2' }),
    );
    await act(async () => {
      await view.refetch()('R/next.txt', undefined, {});
    });
    // `kept` holds its old value (b omitted it); `changed` swaps to C2.
    expect(view.container.textContent).toBe('K1C2');

    view.unmount();
  });
});
