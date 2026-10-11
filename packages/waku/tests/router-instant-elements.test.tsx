// @vitest-environment happy-dom

import {
  StrictMode,
  Suspense,
  act,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ETAGS_ID, IMMUTABLE_ETAG } from '../src/lib/utils-isomorphic/etags.js';
import { adoptElements } from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import { getDefaultRootStore } from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE,
  useFetchRsc_UNSTABLE,
  useMergeElements_UNSTABLE,
} from '../src/minimal/client.js';
import { useMergeInstantElements } from '../src/router/client-utils/instant-elements.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

const mocks = vi.hoisted(() => ({
  initial: {} as Elements,
  createFromFetch:
    vi.fn<(response: Promise<Response>) => Promise<Record<string, unknown>>>(),
  encodeReply: vi.fn(),
  createTemporaryReferenceSet: vi.fn(),
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
const stubFetch = () =>
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
const useRefetch = () => {
  const fetchRsc = useFetchRsc_UNSTABLE();
  const mergeInstantElements = useMergeInstantElements();
  const controllerRef = useRef<AbortController>(undefined);
  return (
    rscPath: string,
    rscParams: unknown,
    pin: (key: string | symbol) => boolean,
    base?: Elements,
    overlay?: Elements,
  ) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return mergeInstantElements(
      fetchRsc(rscPath, rscParams, base ? { unstable_base: base } : undefined),
      controller.signal,
      pin,
      base,
      overlay,
    );
  };
};

type Refetch = ReturnType<typeof useRefetch>;

let concurrentRoot: ReturnType<typeof createRoot> | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stubFetch();
  clearInitialRscEntries();
  mocks.initial = {};
  mocks.createFromFetch.mockReset();
  mocks.createFromFetch.mockImplementation(async (response) => {
    await response;
    return mocks.initial;
  });
  mocks.encodeReply.mockResolvedValue('');
  mocks.createTemporaryReferenceSet.mockReturnValue(new Map());
});
afterEach(() => {
  act(() => concurrentRoot?.unmount());
  concurrentRoot = undefined;
  clearInitialRscEntries();
  vi.unstubAllGlobals();
});
describe('instant element merges', () => {
  test('keeps a slot that b introduces but a never had', async () => {
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

    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ dynamic: 'D2', extra: 'X' }),
    );
    const unstable_isEager = (key: string | symbol) => key === 'cached';
    await act(async () => {
      await refetch!('R/next.txt', undefined, unstable_isEager);
    });
    await act(async () => {
      mountExtra();
    });

    expect(container.textContent).toBe('CD2X');

    act(() => root.unmount());
  });

  test('a slot only b introduces is mountable as soon as refetch resolves', async () => {
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
      await refetch!('R/next.txt', undefined, (key) => key === 'cached').then(
        () => {
          mountExtra();
        },
      );
    });

    expect(container.textContent).toBe('CX');

    act(() => root.unmount());
  });

  test('serves an isSwr key from a even when b has a fresh value', async () => {
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

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    const isSwr = (key: string | symbol) => key === 'eager';
    await act(async () => {
      void refetch!('R/next.txt', undefined, isSwr);
    });

    expect(container.textContent).toBe('A1L');

    await act(async () => {
      resolveB({ eager: 'A2', hole: 'H2' });
      await wait();
    });

    expect(container.textContent).toBe('A1H2');

    act(() => root.unmount());
  });

  test('skips the second commit when b introduces no new keys', async () => {
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
      refetched = refetch!('R/next.txt', undefined, (key) => key === 'eager');
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

  test('an overlay key takes the response value once it lands', async () => {
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
      refetched = refetch!(
        'R/next.txt',
        undefined,
        (key) => key === 'ROUTE' || key === 'IS_STATIC',
        undefined,
        { ROUTE: ['/next', 'x=1'], IS_STATIC: false },
      );
    });
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
      refetched = await refetch!(
        'R/next.txt',
        undefined,
        (key) => key === 'eager',
      );
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
      await refetch!('R/next.txt', undefined, (key) => key === 'eager', {
        shared: 'BASE',
      });
    });

    expect(container.textContent).toBe('A1BASE');
    const finalElements = await elementsPromise!;
    await expect(finalElements.shared).resolves.toBe('BASE');

    act(() => root.unmount());
  });

  test('a superseded refetch does not commit onto the newer state', async () => {
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
      refetched1 = refetch!('R/first.txt', undefined, (key) => key === 'eager');
    });

    let resolveB2: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB2 = resolve;
      }),
    );
    let refetched2: Promise<unknown> | undefined;
    await act(async () => {
      refetched2 = refetch!(
        'R/second.txt',
        undefined,
        (key) => key === 'eager',
      );
    });
    const midPromise = elementsPromise!;

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
      refetched = refetch!('R/next.txt', undefined, (key) => key === 'eager');
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
      refetched = refetch!(
        'R/next.txt',
        undefined,
        (key) => key === 'cached',
        adoptElements({
          cached: 'STALE',
          shell: 'S',
          [ETAGS_ID]: { shell: IMMUTABLE_ETAG },
          kept: 'K',
          lazy: 'STALE',
        }),
      );
      mountExtra();
    });
    expect(container.textContent).toBe('C[D]S[K][L]');

    await act(async () => {
      resolveB({ dynamic: 'D2', lazy: 'L' });
      await refetched;
    });
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
      await refetch!('R/next.txt', undefined, (key) => key === 'cached').then(
        () => {
          mountExtra();
        },
      );
    });

    expect(container.textContent).toBe('CX');

    act(() => root.unmount());
  });
});

describe('instant element settlement', () => {
  type Merge = ReturnType<typeof useMergeInstantElements>;

  const renderRoot = async (
    initial: Record<string, unknown>,
    ui: ReactNode,
    fallbackAboveRoot?: ReactNode,
  ) => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable(initial));
    stubFetch();
    let merge: Merge | undefined;
    let update: ReturnType<typeof useMergeElements_UNSTABLE> | undefined;
    const Probe = () => {
      const mergeValue = useMergeInstantElements();
      const updateValue = useMergeElements_UNSTABLE();
      useEffect(() => {
        merge = mergeValue;
        update = updateValue;
      });
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    const app = (
      <Root initialRscPath="R/app.txt">
        {ui}
        <Probe />
      </Root>
    );
    await act(async () => {
      root.render(
        fallbackAboveRoot === undefined ? (
          app
        ) : (
          <Suspense fallback={fallbackAboveRoot}>{app}</Suspense>
        ),
      );
    });
    return {
      container,
      merge: merge!,
      update: update!,
      unmount: () => act(() => root.unmount()),
    };
  };

  const Keys = () => {
    const elements = use(useElementsPromise_UNSTABLE());
    return <i>{Object.keys(elements).join(',')}</i>;
  };

  test('a slot painted from pin or the base stays when the payload lands', async () => {
    const Side = () => {
      const elements = use(useElementsPromise_UNSTABLE());
      return 'side' in elements ? <Slot id="side" /> : null;
    };
    const view = await renderRoot(
      { shell: 'S1', page: 'P1' },
      <>
        <Slot id="shell" />
        <Suspense fallback="…">
          <Slot id="page" />
          <Side />
        </Suspense>
      </>,
    );
    const payload = Promise.withResolvers<Record<string, unknown>>();

    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        (key) => key === 'shell',
        adoptElements({
          side: 'B',
          [ETAGS_ID]: { side: IMMUTABLE_ETAG },
        }),
      );
    });
    await act(async () => {
      payload.resolve(
        adoptElements({
          shell: 'S2',
          page: 'P2',
          side: 'N',
          [ETAGS_ID]: { shell: 'v2', side: 'v2' },
        }),
      );
      await payload.promise;
    });

    expect(view.container.textContent).toBe('S1P2B');
    expect(getDefaultRootStore()?.etags).toEqual({ side: IMMUTABLE_ETAG });
    view.unmount();
  });

  test('a payload with no new slot settles without showing the fallback above the Root', async () => {
    const AboveRoot = vi.fn(() => 'ABOVE');
    const view = await renderRoot(
      { shell: 'S1', page: 'P1' },
      <>
        <Slot id="shell" />
        <Suspense fallback="…">
          <Slot id="page" />
        </Suspense>
      </>,
      <AboveRoot />,
    );
    const payload = Promise.withResolvers<Record<string, unknown>>();
    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        (key) => key === 'shell',
      );
    });
    expect(view.container.textContent).toBe('S1…');
    AboveRoot.mockClear();

    await act(async () => {
      payload.resolve({ shell: 'S1', page: 'P2' });
      await payload.promise;
    });

    expect(view.container.textContent).toBe('S1P2');
    expect(AboveRoot).not.toHaveBeenCalled();
    view.unmount();
  });

  test('settlement preserves overlay keys replaced by an unrelated merge', async () => {
    const view = await renderRoot(
      { shell: 'shell', page: 'before', meta: 'before-meta' },
      <>
        <Slot id="shell" />
        <Slot id="page" />
        <Slot id="meta" />
        <Keys />
      </>,
    );
    const payload = Promise.withResolvers<Elements>();
    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        () => true,
        undefined,
        { page: 'loading', meta: 'loading-meta' },
      );
    });
    await act(async () => {
      await view.update(
        adoptElements({
          meta: 'action-meta',
          [ETAGS_ID]: { meta: 'action-v2' },
        }),
      );
    });
    await act(async () => {
      payload.resolve(
        adoptElements({
          page: 'after',
          meta: 'response-meta',
          extra: 'extra',
          [ETAGS_ID]: {
            page: 'page-v2',
            meta: 'response-v1',
            extra: IMMUTABLE_ETAG,
          },
        }),
      );
      await payload.promise;
    });

    expect(view.container.textContent).toBe(
      'shellafteraction-metashell,page,meta,extra',
    );
    expect(getDefaultRootStore()?.etags).toEqual({
      page: 'page-v2',
      meta: 'action-v2',
      extra: IMMUTABLE_ETAG,
    });
    view.unmount();
  });

  test('an unrelated merge in one Root does not prevent either Root from settling a shared response', async () => {
    const first = await renderRoot(
      { page: 'before' },
      <>
        <Slot id="page" />
        <Keys />
      </>,
    );
    const second = await renderRoot(
      { page: 'before' },
      <>
        <Slot id="page" />
        <Keys />
      </>,
    );
    const payload = Promise.withResolvers<Elements>();
    await act(async () => {
      void first.merge(
        payload.promise,
        new AbortController().signal,
        () => false,
      );
      void second.merge(
        payload.promise,
        new AbortController().signal,
        () => false,
      );
    });
    await act(async () => {
      await first.update({ page: 'action', local: 'local' });
    });
    await act(async () => {
      payload.resolve({ page: 'after', extra: 'extra' });
      await payload.promise;
    });
    expect(first.container.textContent).toBe('actionpage,local,extra');
    expect(second.container.textContent).toBe('afterpage,extra');
    first.unmount();
    second.unmount();
  });

  test('the paint keeps the etags of an overlay made by Minimal', async () => {
    const view = await renderRoot({ page: 'P1' }, <Keys />);
    const payload = Promise.withResolvers<Record<string, unknown>>();

    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        () => true,
        undefined,
        adoptElements({
          lazy: 'L',
          [ETAGS_ID]: { lazy: IMMUTABLE_ETAG },
        }),
      );
    });

    expect(view.container.textContent).toBe('page,lazy');
    expect(getDefaultRootStore()?.etags).toEqual({ lazy: IMMUTABLE_ETAG });
    await act(async () => {
      payload.resolve({ page: 'P1' });
      await payload.promise;
    });
    view.unmount();
  });

  test('inherited overlay keys do not replace pinned slots', async () => {
    const view = await renderRoot(
      {
        toString: 'pinned',
        page: 'before',
        [ETAGS_ID]: { toString: IMMUTABLE_ETAG },
      },
      <>
        <Slot id="toString" />
        <Slot id="page" />
      </>,
    );
    const payload = Promise.withResolvers<Record<string, unknown>>();

    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        (key) => key === 'toString',
        undefined,
        {
          page: 'loading',
        },
      );
    });
    expect(view.container.textContent).toBe('pinnedloading');

    await act(async () => {
      payload.resolve(
        adoptElements({
          toString: 'fresh',
          page: 'after',
          [ETAGS_ID]: { toString: 'v2' },
        }),
      );
      await payload.promise;
    });

    expect(view.container.textContent).toBe('pinnedafter');
    expect(getDefaultRootStore()?.etags).toEqual({ toString: IMMUTABLE_ETAG });
    view.unmount();
  });

  test("an overlay's client-only symbol key keeps its value when the payload lands", async () => {
    const state = Symbol('state');
    const State = () => {
      const elements = use(useElementsPromise_UNSTABLE());
      return <b>{String(elements[state])}</b>;
    };
    const view = await renderRoot({ page: 'P1' }, <State />);
    const payload = Promise.withResolvers<Record<string | symbol, unknown>>();

    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        () => true,
        undefined,
        {
          [state]: 'new',
        },
      );
    });
    await act(async () => {
      payload.resolve({ page: 'P1', extra: 'X', [state]: 'old' });
      await payload.promise;
    });

    expect(view.container.textContent).toBe('new');
    view.unmount();
  });

  test("a payload's symbol key the paint lacks does not land", async () => {
    const state = Symbol('state');
    const Has = () => {
      const elements = use(useElementsPromise_UNSTABLE());
      return <b>{String(state in elements)}</b>;
    };
    const view = await renderRoot({ page: 'P1' }, <Has />);
    const payload = Promise.withResolvers<Record<string | symbol, unknown>>();

    await act(async () => {
      void view.merge(
        payload.promise,
        new AbortController().signal,
        () => true,
      );
    });
    await act(async () => {
      payload.resolve({ page: 'P1', extra: 'X', [state]: 'from the payload' });
      await payload.promise;
    });

    expect(view.container.textContent).toBe('false');
    view.unmount();
  });

  test('a payload that rejects leaves the paint with the old values', async () => {
    const view = await renderRoot(
      { shell: 'S1', page: 'P1', meta: 'M0' },
      <>
        <Slot id="shell" />
        <Suspense fallback="…">
          <Slot id="page" />
        </Suspense>
        <Suspense fallback="">
          <Slot id="meta" />
        </Suspense>
      </>,
    );
    const payload = Promise.withResolvers<Record<string, unknown>>();

    let merged: Promise<unknown> | undefined;
    await act(async () => {
      merged = view.merge(
        payload.promise,
        new AbortController().signal,
        (key) => key === 'shell',
        undefined,
        { meta: 'M' },
      );
    });
    expect(view.container.textContent).toBe('S1…M');
    await act(async () => {
      payload.reject(new Error('failed'));
      await merged?.catch(() => {});
    });

    expect(view.container.textContent).toBe('S1P1M');
    view.unmount();
  });

  test('two Roots that merge one payload each land it', async () => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ page: 'P' }));
    stubFetch();
    const merges: Merge[] = [];
    const Probe = () => {
      const merge = useMergeInstantElements();
      useEffect(() => {
        merges.push(merge);
      }, [merge]);
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <Root initialRscPath="R/app.txt">
            <Keys />
            <Probe />
          </Root>
          <Root initialRscPath="R/app.txt">
            <Keys />
            <Probe />
          </Root>
        </>,
      );
    });
    const payload = Promise.withResolvers<Record<string, unknown>>();

    await act(async () => {
      for (const merge of merges) {
        void merge(payload.promise, new AbortController().signal, () => true);
      }
    });
    await act(async () => {
      payload.resolve({ page: 'P', extra: 'X' });
      await payload.promise;
    });

    expect(container.textContent).toBe('page,extrapage,extra');
    act(() => root.unmount());
  });
});

const controls = new Map<string, ReturnType<typeof useMergeInstantElements>>();
const Probe = ({ id }: { id: string }) => {
  const merge = useMergeInstantElements();
  const elements = use(useElementsPromise_UNSTABLE());
  useLayoutEffect(() => {
    controls.set(id, merge);
  });
  return <output data-root={id}>{Object.keys(elements).join(',')}</output>;
};
const mount = async (children: ReactNode) => {
  const container = document.createElement('div');
  concurrentRoot = createRoot(container);
  await act(async () => {
    concurrentRoot!.render(<StrictMode>{children}</StrictMode>);
    await wait();
  });
  return container;
};
const app = (id: string, children?: ReactNode) => (
  <Root initialRscPath="initial">
    <Probe id={id} />
    {children}
  </Root>
);

test('a shared response retains each Root merge configuration', async () => {
  mocks.initial = { shell: 'old shell', page: 'old page' };
  const view = await mount(
    <>
      {app(
        'a',
        <>
          <Slot id="shell" />
          <Suspense fallback="wait a">
            <Slot id="page" />
          </Suspense>
        </>,
      )}
      {app(
        'b',
        <>
          <Suspense fallback="wait b">
            <Slot id="shell" />
          </Suspense>
          <Slot id="page" />
        </>,
      )}
    </>,
  );
  const response = Promise.withResolvers<Elements>();
  let first!: Promise<Elements>;
  let second!: Promise<Elements>;
  await act(async () => {
    first = controls.get('a')!(
      response.promise,
      new AbortController().signal,
      (key) => key === 'shell',
      undefined,
      {
        page: 'overlay a',
      },
    );
    second = controls.get('b')!(
      response.promise,
      new AbortController().signal,
      (key) => key === 'page',
      undefined,
      {
        shell: 'overlay b',
      },
    );
    await wait();
  });
  expect(view.textContent).toContain('old shelloverlay a');
  expect(view.textContent).toContain('overlay bold page');
  await act(async () => {
    response.resolve({ shell: 'new shell', page: 'new page', added: 'extra' });
    await first;
    await second;
    await wait();
  });
  expect(view.textContent).toContain('old shellnew page');
  expect(view.textContent).toContain('new shellold page');
  expect(view.querySelectorAll('output')[0]?.textContent).toBe(
    'shell,page,added',
  );
  expect(view.querySelectorAll('output')[1]?.textContent).toBe(
    'shell,page,added',
  );
});

test('settling a tagged hole keeps its pinned shell visible', async () => {
  mocks.initial = {
    shell: 'old shell',
    page: 'old page',
    _etags: { shell: 1, page: 'v1' },
  };
  const fallback = vi.fn(() => 'outer');
  const Fallback = fallback;
  const view = await mount(
    <Suspense fallback={<Fallback />}>
      {app(
        'a',
        <>
          <Slot id="shell" />
          <Suspense fallback="waiting">
            <Slot id="page" />
          </Suspense>
        </>,
      )}
    </Suspense>,
  );
  const response = Promise.withResolvers<Elements>();
  let result!: Promise<Elements>;
  await act(async () => {
    result = controls.get('a')!(
      response.promise,
      new AbortController().signal,
      (key) => key === 'shell',
    );
    await wait();
  });
  expect(view.textContent).toContain('old shellwaiting');
  fallback.mockClear();
  await act(async () => {
    response.resolve(
      adoptElements({
        shell: 'new shell',
        page: 'new page',
        _etags: { shell: 1, page: 'v2' },
      }),
    );
    await result;
    await wait();
  });
  expect(view.textContent).toContain('old shellnew page');
  expect(fallback).not.toHaveBeenCalled();
});
