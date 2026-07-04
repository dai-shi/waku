// @vitest-environment happy-dom

import { Suspense, act, useState } from 'react';
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
import { fetchRscStore } from '../src/minimal/client-utils/fetch-store.js';
import {
  Root,
  Slot,
  unstable_callServerRsc,
  unstable_fetchRsc,
  unstable_prefetchRsc,
  unstable_registerCallServerElementsListener,
  unstable_registerFetchEnhancer,
  unstable_registerFetchRscInputTransformer,
  useElementsPromise_UNSTABLE,
  useRefetch,
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
  delete (globalThis as any).__WAKU_PREFETCHED__;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('minimal/client prefetch', () => {
  test('unstable_prefetchRsc returns a decoded Promise<Elements>', async () => {
    // Minimal no longer parks or reuses prefetches; it just fetches + decodes
    // and hands the promise back to the caller (the router holds it).
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('prefetched'),
    );
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=1' });

    const elements = await unstable_prefetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    expect(elements).toEqual({ _value: null, text: 'prefetched' });
  });

  test('a fetch after a prefetch issues its own request (minimal holds nothing)', async () => {
    // No prefetch cache: each prefetch and each fetch is an independent
    // request. Reuse of the prefetched shell is the router's job.
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('x'));
    track(unstable_registerFetchEnhancer(() => fetchMock));
    const rscParams = new URLSearchParams({ query: 'x=1' });

    await unstable_prefetchRsc('R/next.txt', rscParams);
    await unstable_fetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
  });

  test('server actions use the current fetch, not the one a prefetch decoded with', async () => {
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
    await unstable_prefetchRsc('R/page.txt', undefined);
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
    void unstable_prefetchRsc('R/page.txt', undefined);

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
});

describe('minimal/client eager merge', () => {
  test('keeps a slot that b introduces but a never had', async () => {
    // Cached a: a slot resolved eagerly + a slot resolved lazily. No `extra`.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, cached: 'C', dynamic: 'D1' }),
    );
    stubFetch();

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      refetch = useRefetch();
      const [extra, setExtra] = useState(false);
      mountExtra = () => setExtra(true);
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
    const unstable_isEager = (key: string) => key === 'cached';
    await act(async () => {
      await refetch!('R/next.txt', undefined, {
        unstable_isSwr: unstable_isEager,
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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      refetch = useRefetch();
      const [extra, setExtra] = useState(false);
      mountExtra = () => setExtra(true);
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
        unstable_isSwr: (key) => key === 'cached',
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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    const Probe = () => {
      refetch = useRefetch();
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
    const isSwr = (key: string) => key === 'eager';
    await act(async () => {
      void refetch!('R/next.txt', undefined, { unstable_isSwr: isSwr });
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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      refetch = useRefetch();
      elementsPromise = useElementsPromise_UNSTABLE();
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
        unstable_isSwr: (key) => key === 'eager',
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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      refetch = useRefetch();
      elementsPromise = useElementsPromise_UNSTABLE();
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
        unstable_isSwr: (key) => key === 'eager',
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

  test('a superseded refetch does not commit onto the newer state', async () => {
    // If another refetch commits between the eager merge and the response,
    // the stale response's second commit must leave the newer state as is:
    // grafting onto it would re-render it and plant stale keys.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, eager: 'A1', hole: 'H1' }),
    );
    stubFetch();

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      refetch = useRefetch();
      elementsPromise = useElementsPromise_UNSTABLE();
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
        unstable_isSwr: (key) => key === 'eager',
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
        unstable_isSwr: (key) => key === 'eager',
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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      refetch = useRefetch();
      elementsPromise = useElementsPromise_UNSTABLE();
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
        unstable_isSwr: (key) => key === 'eager',
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

  test('an incomplete prefetch is ignored: refetch fetches fresh', async () => {
    // complete: false is reserved: the elements must not serve as the data
    // source nor be grafted (a stale graft would shadow the response's
    // values); a fresh request serves the navigation.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ _value: null, cached: 'C', dynamic: 'D1' }),
    );
    stubFetch();

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let elementsPromise: Promise<Record<string, unknown>> | undefined;
    const Probe = () => {
      refetch = useRefetch();
      elementsPromise = useElementsPromise_UNSTABLE();
      return null;
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

    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ dynamic: 'D2' }),
    );
    let refetched: unknown;
    await act(async () => {
      refetched = await refetch!('R/next.txt', undefined, {
        unstable_isSwr: (key) => key === 'cached',
        unstable_prefetched: {
          elements: { cached: 'STALE', dynamic: 'STALE', planted: 'STALE' },
          complete: false,
        },
      });
    });

    // a fresh request was made and its response won
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('CD2');
    expect(refetched).toEqual({ dynamic: 'D2' });
    const finalElements = await elementsPromise!;
    expect('planted' in finalElements).toBe(false);

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

    let refetch: ReturnType<typeof useRefetch> | undefined;
    let mountExtra: () => void = () => {};
    const Probe = () => {
      refetch = useRefetch();
      const [extra, setExtra] = useState(false);
      mountExtra = () => setExtra(true);
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
        unstable_isSwr: (key) => key === 'cached',
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
    ui: (refetchRef: { current?: ReturnType<typeof useRefetch> }) => ReactNode,
  ) => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable(initial));
    stubFetch();
    const refetchRef: { current?: ReturnType<typeof useRefetch> } = {};
    const Probe = () => {
      refetchRef.current = useRefetch();
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

  test('a complete prefetch paints elements immediately without fetching', async () => {
    const view = await mount({ _value: null, page: 'P1' }, () => (
      <Suspense fallback={null}>
        <Slot id="page" />
      </Suspense>
    ));
    expect(view.container.textContent).toBe('P1');

    mocks.createFromFetch.mockClear();
    await act(async () => {
      await view.refetch()('R/done.txt', undefined, {
        unstable_prefetched: {
          elements: { _value: null, page: 'P2' },
          complete: true,
        },
      });
    });
    expect(view.container.textContent).toBe('P2');
    expect(mocks.createFromFetch).not.toHaveBeenCalled();

    view.unmount();
  });

  test('reusing a complete prefetch re-checks the build id', async () => {
    vi.stubEnv('WAKU_BUILD_ID', 'build-1');
    const view = await mount(
      { _value: null, page: 'P1', _buildId: 'build-1' },
      () => (
        <Suspense fallback={null}>
          <Slot id="page" />
        </Suspense>
      ),
    );
    const onBuildIdMismatch = vi.fn();
    await act(async () => {
      await view.refetch()('R/done.txt', undefined, {
        unstable_prefetched: {
          elements: { _value: null, page: 'P2', _buildId: 'build-2' },
          complete: true,
        },
        onBuildIdMismatch,
      });
      await wait();
    });
    expect(onBuildIdMismatch).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test('new key: a slot b introduces suspends, then shows b', async () => {
    let mountExtra = () => {};
    const view = await mount({ _value: null, main: 'M1' }, (ref) => {
      const Holder = () => {
        ref.current = useRefetch();
        const [extra, setExtra] = useState(false);
        mountExtra = () => setExtra(true);
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
