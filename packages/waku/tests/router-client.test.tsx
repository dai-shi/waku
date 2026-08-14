// @vitest-environment happy-dom

import { StrictMode, act, use, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { preloadModule } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
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
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { fetchRscStore } from '../src/minimal/client-utils/fetch-store.js';
import {
  Children_UNSTABLE as Children,
  INTERNAL_ServerRoot,
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_fetchRsc as fetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { PREFETCH_LIMIT } from '../src/router/client-utils/prefetch-cache.js';
import {
  ErrorBoundary,
  INTERNAL_ServerRouter,
  Link,
  Router,
  unstable_RouterContext as RouterContext,
  Slice,
  Unstable_SearchCodecsProvider,
  unstable_encodeRoutePath,
  unstable_encodeSliceId,
  unstable_getRouteSlotId,
  unstable_getSliceSlotId,
  unstable_parseRoute,
  useNavigationStatus_UNSTABLE as useNavigationStatus,
  useParams_UNSTABLE as useParams,
  useRouter,
} from '../src/router/client.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
} from '../src/router/isomorphic-utils/route-path.js';

const postsSearchCodec = {
  id: 'posts-test',
  parse: (query: string) => ({
    tab: new URLSearchParams(query).get('tab') ?? '',
  }),
  serialize: (search: { tab: string }) =>
    new URLSearchParams({ tab: search.tab }).toString(),
} as const;

declare module '../src/router/base-types.js' {
  interface SearchCodecsConfig {
    '/posts/[slug]': typeof postsSearchCodec;
  }
}

(
  globalThis as { __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string> }
).__WAKU_ROUTER_SEARCH_CODECS__ = { '/posts/[slug]': 'posts-test' };

type ElementsMap = Record<string, unknown>;
type RouterApi = ReturnType<typeof useRouter>;
type IntersectionObserverMockInstance = IntersectionObserver & {
  callback: IntersectionObserverCallback;
};

// Hoisted so the `vi.mock` factory can read it. `elements` is the initial
// elements a mocked Root seeds; `inner` is the shared, configurable RSC
// request mock tests observe. Each mocked Root keeps its OWN elements state
// (see the factory), so independent Roots behave independently like the real
// client.
const testHoisted = vi.hoisted(() => ({
  elements: {} as Record<string, unknown>,
  inner: null as
    ((...args: unknown[]) => Promise<Record<string, unknown>>) | null,
  prefetch: vi.fn(
    async (..._args: unknown[]): Promise<Record<string, unknown>> => ({}),
  ),
  mergeTypes: [] as Array<'sync' | 'async' | 'swr'>,
  mergeOptions: [] as Array<
    | {
        unstable_overlay?: Record<string, unknown>;
        unstable_swr?: {
          pin: (key: string | symbol) => boolean;
          base?: Record<string, unknown>;
        };
      }
    | undefined
  >,
  onMerge: null as (() => void) | null,
}));

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const resolvedThenable = <T,>(value: T): Promise<T> =>
  Object.assign(Promise.resolve(value), {
    status: 'fulfilled' as const,
    value,
  });

// A real route response carries its ROUTE_ID and route slot; tests that only
// configure content (or nothing) get those defaulted from the request so the
// derived route can follow the navigation.
const withRouteMeta = (
  result: unknown,
  rscPath: string,
  rscParams: unknown,
): Record<string, unknown> => {
  if (!result || typeof result !== 'object') {
    return {};
  }
  const data = result as Record<string, unknown>;
  if (ROUTE_ID in data || !rscPath.startsWith('R/')) {
    return data;
  }
  const routePath = decodeRoutePath(rscPath);
  const query =
    rscParams instanceof URLSearchParams ? (rscParams.get('query') ?? '') : '';
  // Inject only the route metadata; the route slot itself comes from the
  // initial elements or the configured response.
  return { ...data, [ROUTE_ID]: [routePath, query] };
};

// Per-root elements state, wired to each mocked Root through context so a
// refetch or merge targets the Root that made it (see the factory).
type RootStore = {
  applySync: (data: Record<string, unknown>) => void;
  applyAsync: (data: Promise<Record<string, unknown>>) => void;
  applySwr: (
    result: Record<string, unknown>,
    overlay: Record<string, unknown> | undefined,
    pin: (key: string | symbol) => boolean,
  ) => void;
};
type RefetchInner = (
  rscPath: string,
  rscParams?: unknown,
  options?: {
    signal?: AbortSignal;
    onBuildIdMismatch?: () => void;
    unstable_base?: Record<string, unknown>;
    unstable_overlay?: Record<string, unknown>;
    unstable_swr?: {
      pin: (key: string | symbol) => boolean;
      base?: Record<string, unknown>;
    };
  },
) => Promise<Record<string, unknown>>;
type MockedRefetch = ReturnType<typeof vi.fn<RefetchInner>>;
const prefetchRsc = testHoisted.prefetch as unknown as MockedRefetch;

// Install a test-provided refetch as the shared inner mock the mocked Roots
// wrap. Returns it so the test keeps configuring/inspecting it.
const installRefetch = (inner: MockedRefetch) => {
  testHoisted.inner = inner as unknown as typeof testHoisted.inner;
  return inner;
};

const getRefetchMock = (): MockedRefetch => {
  if (!testHoisted.inner) {
    throw new Error('refetch mock not initialized');
  }
  return testHoisted.inner as unknown as MockedRefetch;
};

const getIntersectionObserverMockInstance = () => {
  const ctor = globalThis.IntersectionObserver as unknown as {
    mock?: {
      results?: Array<{
        type: string;
        value: IntersectionObserverMockInstance;
      }>;
    };
  };
  const results = ctor.mock?.results;
  if (!results) {
    throw new Error('IntersectionObserver constructor was not mocked');
  }
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.type === 'return') {
      return result.value;
    }
  }
  throw new Error('IntersectionObserver was not constructed');
};

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    preloadModule: vi.fn(),
  };
});

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: vi.fn(async (responsePromise: Promise<Response>) => {
      await responsePromise;
      return {};
    }),
    encodeReply: vi.fn(async () => ''),
    createTemporaryReferenceSet: vi.fn(() => new Map()),
  },
}));

// This hand models minimal's merge semantics; minimal-client.test.tsx holds
// the tests that keep the model honest (see its overlay cases).
vi.mock('../src/minimal/client.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/minimal/client.js')
  >('../src/minimal/client.js');
  const React = await vi.importActual<typeof import('react')>('react');

  const makeThenable = (value: Record<string, unknown>) =>
    Object.assign(Promise.resolve(value), {
      status: 'fulfilled' as const,
      value,
    });

  const chainMergeCache = new WeakMap<
    object,
    WeakMap<object, Promise<Record<string, unknown>>>
  >();
  const chainMerge = (
    prev: Promise<Record<string, unknown>>,
    data: Record<string, unknown> | Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> => {
    let byData = chainMergeCache.get(prev);
    if (!byData) {
      byData = new WeakMap();
      chainMergeCache.set(prev, byData);
    }
    let result = byData.get(data);
    if (!result) {
      const prevValue =
        (prev as { status?: string }).status === 'fulfilled'
          ? (prev as unknown as { value: Record<string, unknown> }).value
          : undefined;
      result =
        prevValue && !('then' in data)
          ? makeThenable({ ...prevValue, ...data })
          : Promise.all([prev, data]).then(([a, b]) => ({ ...a, ...b }));
      byData.set(data, result);
    }
    return result;
  };

  // A pinned key keeps the previous value: the eager pass held it instead of
  // leaving a hole, and minimal's second pass only refreshes new and overlay
  // keys. That staleness is real and the router has to plan for it.
  const chainSwrCache = new WeakMap<
    object,
    WeakMap<object, Promise<Record<string, unknown>>>
  >();
  const chainSwr = (
    prev: Promise<Record<string, unknown>>,
    result: Record<string, unknown>,
    overlay: Record<string, unknown> | undefined,
    pin: (key: string | symbol) => boolean,
  ): Promise<Record<string, unknown>> => {
    let byResult = chainSwrCache.get(prev);
    if (!byResult) {
      byResult = new WeakMap();
      chainSwrCache.set(prev, byResult);
    }
    let merged = byResult.get(result);
    if (!merged) {
      merged = Promise.resolve(prev).then((prevRes) => {
        const next: Record<string | symbol, unknown> = { ...prevRes };
        const from: Record<string | symbol, unknown> = result;
        for (const key of Reflect.ownKeys(result)) {
          if (key === '_value') {
            continue;
          }
          if (!(key in prevRes) || (overlay && key in overlay) || !pin(key)) {
            next[key] = from[key];
          }
        }
        return next as Record<string, unknown>;
      });
      byResult.set(result, merged);
    }
    return merged;
  };

  // Each mocked Root provides its own store through this context, so a refetch
  // or merge from within a Root targets that Root's elements state.
  const StoreContext = React.createContext<RootStore | null>(null);

  const StatefulRoot = (props: { children?: ReactNode }) => {
    const valueRef = React.useRef<Record<string, unknown>>(undefined);
    if (!valueRef.current) {
      valueRef.current = {
        root: React.createElement(actual.Children_UNSTABLE),
        ...testHoisted.elements,
      };
    }
    const [elements, setElements] = React.useState<
      Promise<Record<string, unknown>>
    >(() => makeThenable(valueRef.current!));
    const storeRef = React.useRef<RootStore>(undefined);
    if (!storeRef.current) {
      storeRef.current = {
        // synchronous merge of a value (route metadata with no fetch)
        // both merges chain off the previous elements like the real
        // client's setElements(prev => merge(prev, ...)). The result is
        // cached per (prev, data) like minimal's merge helpers, so React
        // rebasing the updater re-runs it idempotently.
        applySync: (data) => {
          testHoisted.onMerge?.();
          testHoisted.mergeTypes.push('sync');
          setElements((prev) => chainMerge(prev, data));
        },
        // eager merge of a pending fetch: elements suspend until it resolves,
        // like the real client, so a transition stays pending across the fetch
        applyAsync: (dataPromise) => {
          testHoisted.mergeTypes.push('async');
          setElements((prev) => chainMerge(prev, dataPromise));
        },
        // the swr response landing: minimal refreshes the keys the eager pass
        // left as holes plus the overlay keys, and keeps the pinned ones
        applySwr: (result, overlay, pin) => {
          testHoisted.mergeTypes.push('swr');
          setElements((prev) => chainSwr(prev, result, overlay, pin));
        },
      };
    }
    // A boundary so a merge that suspends (pending fetch) shows a fallback
    // instead of crashing on a non-transition update; the real app supplies its
    // own boundaries.
    return React.createElement(
      StoreContext.Provider,
      { value: storeRef.current },
      React.createElement(
        React.Suspense,
        { fallback: null },
        actual.INTERNAL_ServerRoot({
          elementsPromise: elements,
          children: props.children,
        }),
      ),
    );
  };

  const noopMergeElements = async (
    data: Record<string, unknown> | Promise<Record<string, unknown>>,
  ) => data;
  const mergeByStore = new WeakMap<
    object,
    (
      data: Record<string, unknown> | Promise<Record<string, unknown>>,
      options?: {
        unstable_overlay?: Record<string, unknown>;
        unstable_swr?: { pin: (key: string | symbol) => boolean };
      },
    ) => Promise<Record<string, unknown>>
  >();
  const useMockMergeElements = () => {
    const store = React.use(StoreContext);
    let fn = store && mergeByStore.get(store);
    if (!fn) {
      fn = (data, options) => {
        testHoisted.mergeOptions.push(options);
        const overlay = options?.unstable_overlay;
        const swr = options?.unstable_swr;
        const dataPromise = Promise.resolve(data);
        if (swr) {
          if (overlay) {
            store?.applySync(overlay);
          }
          dataPromise.then(
            (result) => store?.applySwr(result, overlay, swr.pin),
            () => {},
          );
          return dataPromise;
        }
        if (data instanceof Promise || 'then' in data) {
          store?.applyAsync(
            dataPromise.then(
              (result) => ({ ...result, ...overlay }),
              () => ({}),
            ),
          );
        } else {
          store?.applySync({ ...data, ...overlay });
        }
        return dataPromise;
      };
      if (store) {
        mergeByStore.set(store, fn);
      }
    }
    return fn;
  };

  const abortable = <T,>(promise: Promise<T>, signal?: AbortSignal) => {
    if (!signal) {
      return promise;
    }
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  };

  return {
    ...actual,
    Root_UNSTABLE: vi.fn((props: Parameters<typeof actual.Root_UNSTABLE>[0]) =>
      React.createElement(StatefulRoot, props),
    ),
    useMergeElements_UNSTABLE: () =>
      useMockMergeElements() ?? noopMergeElements,
    unstable_fetchRsc: vi.fn(
      (
        rscPath: string,
        rscParams?: unknown,
        options?: {
          signal?: AbortSignal;
          onBuildIdMismatch?: () => void;
          unstable_base?: Record<string, unknown>;
        },
      ) => {
        const hasOptions = options && Reflect.ownKeys(options).length;
        const rest =
          !hasOptions && rscParams === undefined
            ? []
            : !hasOptions
              ? [rscParams]
              : [rscParams, options];
        const requested = Promise.resolve(
          (!options?.signal && rscPath.startsWith('R/')
            ? testHoisted.prefetch
            : testHoisted.inner!)(rscPath, ...rest),
        );
        const data = abortable(requested, options?.signal);
        return data.then((result) => ({
          ...options?.unstable_base,
          ...withRouteMeta(result, rscPath, rscParams),
        }));
      },
    ),
  };
});

const renderApp = async (element: ReactElement) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const stubScrollY = (value: number) => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
  Object.defineProperty(window, 'scrollY', { configurable: true, value });
  return () => {
    if (descriptor) {
      Object.defineProperty(window, 'scrollY', descriptor);
    } else {
      Reflect.deleteProperty(window, 'scrollY');
    }
  };
};

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve));
  });
  // one more round so effect-driven updates (e.g. a boundary reset after a
  // followed commit) also land
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve));
  });
};

// flushing a fixed number of times makes a test depend on how fast the machine
// schedules; wait for the state the assertion is about instead
const flushUntil = async (settled: () => boolean, max = 40) => {
  for (let i = 0; i < max && !settled(); i += 1) {
    await flush();
  }
};

const renderRouter = async (
  props: Parameters<typeof Router>[0],
  elements: ElementsMap,
) => {
  testHoisted.elements = elements;
  return renderApp(
    <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
      <Router {...(props || {})} />
    </Unstable_SearchCodecsProvider>,
  );
};

const renderRouterInStrictMode = async (
  props: Parameters<typeof Router>[0],
  elements: ElementsMap,
) => {
  testHoisted.elements = elements;
  return renderApp(
    <StrictMode>
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <Router {...(props || {})} />
      </Unstable_SearchCodecsProvider>
    </StrictMode>,
  );
};

const renderWithMinimalRoot = (
  element: ReactElement,
  elements: ElementsMap,
) => {
  testHoisted.elements = elements;
  return renderApp(<Root initialRscPath="">{element}</Root>);
};

beforeAll(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllEnvs();
});

beforeEach(() => {
  window.history.replaceState({}, '', '/start');

  delete (globalThis as Record<string, unknown>).__WAKU_PREFETCHED__;
  testHoisted.elements = {};
  testHoisted.mergeTypes.length = 0;
  testHoisted.mergeOptions.length = 0;
  testHoisted.onMerge = null;
  // Fresh shared request mock per test. The mocked fetch wraps it, so its
  // implementation must stay intact (do not mockReset it).
  testHoisted.inner = vi.fn(async () => ({}));
  vi.mocked(fetchRsc).mockClear();
  vi.mocked(preloadModule).mockClear();
  prefetchRsc.mockReset();
  // A prefetch returns the decoded Promise<Elements>; default to an empty
  // shell so prefetchRoute's cache wiring has a promise to track.
  prefetchRsc.mockReturnValue(resolvedThenable({}));
  vi.mocked(Root).mockClear();

  const IntersectionObserverMock = vi.fn(function (
    callback: IntersectionObserverCallback,
  ) {
    const observe = vi.fn<(target: Element) => void>();
    const disconnect = vi.fn();
    const unobserve = vi.fn<(target: Element) => void>();
    const takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => []);
    const instance: IntersectionObserverMockInstance = {
      root: null,
      rootMargin: '',
      thresholds: [],
      callback,
      observe,
      disconnect,
      unobserve,
      takeRecords,
      scrollMargin: '',
    };
    return instance;
  });

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverMock,
  });

  delete (globalThis as Record<string, unknown>).__WAKU_ROUTER_PREFETCH__;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('router navigation method path typing', () => {
  test('prefetch, push, and replace accept the same targets (route href or structured)', () => {
    // prefetch now mirrors push/replace: a typed route href or a structured
    // target. RouteConfig.paths is not augmented here, so RouteHref is `string`
    // and a computed string is still accepted; the rejection of computed
    // strings in a typed-route app is proven in the augmented fs-router
    // fixture (router-target-typing.ts, redirect-typing.ts).
    // Parameters<> on an overloaded type resolves the structured overload, so
    // this equality asserts the structured form matches; the closure below
    // exercises the href form.
    type PrefetchArg = Parameters<RouterApi['prefetch']>[0];
    type PushArg = Parameters<RouterApi['push']>[0];
    expectType<TypeEqual<PrefetchArg, PushArg>>(true);

    // Type-level assertions; the closure is never invoked.
    const assertTypes = (router: RouterApi) => {
      void router.prefetch('/x');
      void router.push('/x');
      void router.replace('/x');
      void router.prefetch({ to: '/posts/[slug]', params: { slug: 'a' } });
      void router.push({ to: '/posts/[slug]', params: { slug: 'a' } });
      void router.replace({ to: '/posts/[slug]', params: { slug: 'a' } });
    };
    expect(typeof assertTypes).toBe('function');
  });
});

describe('router/client utilities', () => {
  test('SearchCodecsProvider throws on a duplicate codec id', async () => {
    const a = { id: 'dup', parse: () => ({}), serialize: () => '' } as const;
    const b = {
      id: 'dup',
      parse: () => ({ x: 1 }),
      serialize: () => '',
    } as const;
    await expect(
      renderApp(
        <Unstable_SearchCodecsProvider searchCodecs={[a, b]}>
          <div />
        </Unstable_SearchCodecsProvider>,
      ),
    ).rejects.toThrow(/Duplicate search codec id/);
  });

  test('SearchCodecsProvider warns on and ignores non-codec values', async () => {
    const codec = {
      id: 'real',
      parse: () => ({}),
      serialize: () => '',
    } as const;
    const notCodec = { id: 3, first: 'react', last: 'js' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={{ codec, notCodec }}>
        <div />
      </Unstable_SearchCodecsProvider>,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not a search codec'),
      notCodec,
    );
    warn.mockRestore();
    view.unmount();
  });

  test('parses route path/query/hash and canonicalizes path from pathname', () => {
    const route = unstable_parseRoute(
      new URL('http://localhost/foo/index.html?count=2#hash'),
    );
    expect(route).toEqual({
      path: '/foo',
      query: 'count=2',
      hash: '#hash',
    });

    const route2 = unstable_parseRoute(new URL('http://localhost/bar/?q=1'));
    expect(route2).toEqual({
      path: '/bar',
      query: 'q=1',
      hash: '',
    });

    const route3 = unstable_parseRoute(new URL('http://localhost/baz/?q=1'));
    expect(route3).toEqual({
      path: '/baz',
      query: 'q=1',
      hash: '',
    });
  });

  test('ErrorBoundary renders fallback for Error and non-Error values', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const ThrowError = () => {
      throw new Error('boom');
    };
    const ThrowString = () => {
      throw 'boom-string';
    };
    try {
      const first = await renderApp(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>,
      );
      expect(first.container.textContent).toContain(
        'Caught an unexpected error',
      );
      expect(first.container.textContent).toContain('Error: boom');
      first.unmount();

      const second = await renderApp(
        <ErrorBoundary>
          <ThrowString />
        </ErrorBoundary>,
      );
      expect(second.container.textContent).toContain('Error: boom-string');
      second.unmount();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe('useRouter + Link with context', () => {
  const PrefetchOnViewToggleLink = () => {
    const [prefetchOnView, setPrefetchOnView] = useState<
      Record<string, never> | undefined
    >(undefined);
    return (
      <>
        <button
          data-testid="enable-prefetch-on-view"
          onClick={() => setPrefetchOnView({})}
        />
        <Link
          to="/next"
          {...(prefetchOnView
            ? { unstable_prefetchOnView: prefetchOnView }
            : {})}
        >
          next
        </Link>
      </>
    );
  };

  test('throws without RouterContext', async () => {
    const UseRouterComponent = () => {
      useRouter();
      return null;
    };
    await expect(renderApp(<UseRouterComponent />)).rejects.toThrow(
      'Missing Router',
    );
  });

  test('push/replace/reload/back/forward/prefetch call expected router actions', async () => {
    const capture = { router: null as RouterApi | null };
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();

    const Probe = () => {
      setRouter(useRouter() as unknown as RouterApi);
      return null;
    };

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Probe />
      </RouterContext>,
    );

    if (!capture.router) {
      throw new Error('router was not initialized');
    }

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const backSpy = vi.spyOn(window.history, 'back');
    const forwardSpy = vi.spyOn(window.history, 'forward');

    await act(async () => {
      await capture.router!.push('?query=1');
      await capture.router!.replace('?query=2');
      await capture.router!.reload();
      capture.router!.back();
      capture.router!.forward();
      capture.router!.prefetch('/prefetch?x=1#h');
    });

    expect(changeRoute).toHaveBeenNthCalledWith(
      1,
      { path: '/start', query: 'query=1', hash: '' },
      expect.objectContaining({
        shouldScroll: false,
        history: 'push',
        url: expect.any(URL),
      }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      2,
      { path: '/start', query: 'query=2', hash: '' },
      expect.objectContaining({
        shouldScroll: false,
        history: 'replace',
        url: expect.any(URL),
      }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      3,
      { path: '/start', query: '', hash: '' },
      {
        shouldScroll: true,
        refetch: true,
        history: 'replace',
        url: expect.any(URL),
      },
    );
    const firstUrl = (
      (changeRoute.mock.calls[0] as unknown[] | undefined)?.[1] as
        { url?: URL } | undefined
    )?.url;
    expect(firstUrl?.href).toContain('/start?query=1');
    const secondUrl = (
      (changeRoute.mock.calls[1] as unknown[] | undefined)?.[1] as
        { url?: URL } | undefined
    )?.url;
    expect(secondUrl?.href).toContain('/start?query=2');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(forwardSpy).toHaveBeenCalledTimes(1);
    expect(prefetchRoute).toHaveBeenCalledWith(
      {
        path: '/prefetch',
        query: 'x=1',
        hash: '#h',
      },
      undefined,
    );

    view.unmount();
  });

  test('push/replace execute a structured target through changeRoute', async () => {
    const capture = { router: null as RouterApi | null };
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const changeRoute = vi.fn(async () => {});

    const Probe = () => {
      setRouter(useRouter() as unknown as RouterApi);
      return null;
    };

    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <RouterContext
          value={{
            route: { path: '/start', query: '', hash: '' },
            changeRoute,
            prefetchRoute: vi.fn(),
            fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
            lazySliceIds: new Set<string>(),
          }}
        >
          <Probe />
        </RouterContext>
      </Unstable_SearchCodecsProvider>,
    );

    if (!capture.router) {
      throw new Error('router was not initialized');
    }

    await act(async () => {
      await capture.router!.push({
        to: '/posts/[slug]',
        params: { slug: 'a b/c' },
        search: { tab: 'comments' },
        hash: 'top',
      });
      await capture.router!.replace({
        to: '/posts/[slug]',
        params: { slug: 'a b/c' },
        search: { tab: 'comments' },
        hash: 'top',
      });
    });

    const expectedRoute = {
      path: '/posts/a%20b%2Fc',
      query: 'tab=comments',
      hash: '#top',
    };
    expect(changeRoute).toHaveBeenNthCalledWith(
      1,
      expectedRoute,
      expect.objectContaining({ history: 'push', url: expect.any(URL) }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      2,
      expectedRoute,
      expect.objectContaining({ history: 'replace', url: expect.any(URL) }),
    );
    const pushedUrl = (
      (changeRoute.mock.calls[0] as unknown[] | undefined)?.[1] as
        { url?: URL } | undefined
    )?.url;
    expect(pushedUrl?.href).toContain('/posts/a%20b%2Fc?tab=comments#top');

    view.unmount();
  });

  test('prefetch resolves string and structured targets under a basePath', async () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/base/');
    try {
      expect(import.meta.env.WAKU_CONFIG_BASE_PATH).toBe('/base/');
      const capture = { router: null as RouterApi | null };
      const prefetchRoute = vi.fn();
      const Probe = () => {
        capture.router = useRouter() as unknown as RouterApi;
        return null;
      };

      const view = await renderApp(
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <RouterContext
            value={{
              route: { path: '/start', query: '', hash: '' },
              changeRoute: vi.fn(async () => {}),
              prefetchRoute,
              fetchingSlices: new Map<
                string,
                Promise<Record<string, unknown>>
              >(),
              lazySliceIds: new Set<string>(),
            }}
          >
            <Probe />
          </RouterContext>
        </Unstable_SearchCodecsProvider>,
      );

      if (!capture.router) {
        throw new Error('router was not initialized');
      }

      await act(async () => {
        capture.router!.prefetch('/static');
        capture.router!.prefetch({
          to: '/posts/[slug]',
          params: { slug: 'a' },
        });
      });

      expect(prefetchRoute).toHaveBeenNthCalledWith(
        1,
        {
          path: '/static',
          query: '',
          hash: '',
        },
        undefined,
      );
      expect(prefetchRoute).toHaveBeenNthCalledWith(
        2,
        {
          path: '/posts/a',
          query: '',
          hash: '',
        },
        undefined,
      );

      view.unmount();
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('useParams returns decoded params for the matching route', async () => {
    const capture = { params: undefined as unknown };
    const Probe = () => {
      capture.params = useParams({ from: '/posts/[slug]' });
      return null;
    };

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/posts/a%20b', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Probe />
      </RouterContext>,
    );

    expect(capture.params).toEqual({ slug: 'a b' });
    view.unmount();
  });

  test('useParams returns null when the pattern does not match', async () => {
    const capture = { params: undefined as unknown };
    const Probe = () => {
      capture.params = useParams({ from: '/posts/[slug]' });
      return null;
    };

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/about', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Probe />
      </RouterContext>,
    );

    expect(capture.params).toBeNull();
    view.unmount();
  });

  test('useParams params are typed from the pattern', () => {
    // Type-level assertions; the component is never rendered.
    const TypeProbe = () => {
      const slugParams = useParams({ from: '/posts/[slug]' });
      if (slugParams) {
        const slug: string = slugParams.slug;
        void slug;
        // @ts-expect-error unknown param name
        void slugParams.id;
      }
      const catchAllParams = useParams({ from: '/docs/[...path]' });
      if (catchAllParams) {
        const path: string[] = catchAllParams.path;
        void path;
      }
      return null;
    };
    expect(typeof TypeProbe).toBe('function');
  });

  test('useParams re-renders when the route path changes', async () => {
    const capture = { params: undefined as unknown };
    let setRoute:
      | ((route: { path: string; query: string; hash: string }) => void)
      | undefined;

    const Probe = () => {
      capture.params = useParams({ from: '/posts/[slug]' });
      return null;
    };

    const Harness = () => {
      const [route, setRouteState] = useState({
        path: '/posts/a',
        query: '',
        hash: '',
      });
      setRoute = setRouteState;
      return (
        <RouterContext
          value={{
            route,
            changeRoute: vi.fn(async () => {}),
            prefetchRoute: vi.fn(),
            fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
            lazySliceIds: new Set<string>(),
          }}
        >
          <Probe />
        </RouterContext>
      );
    };

    const view = await renderApp(<Harness />);
    expect(capture.params).toEqual({ slug: 'a' });

    await act(async () => {
      setRoute!({ path: '/posts/b', query: '', hash: '' });
    });
    expect(capture.params).toEqual({ slug: 'b' });

    view.unmount();
  });

  test('Link intercepts normal click and skips alt/defaultPrevented clicks', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <>
          <Link to="/next">next</Link>
          <Link to="/prevented" onClick={(event) => event.preventDefault()}>
            prevented
          </Link>
        </>
      </RouterContext>,
    );

    const links = view.container.querySelectorAll('a');
    const normalClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    links[0]!.dispatchEvent(normalClick);
    await flush();

    expect(normalClick.defaultPrevented).toBe(true);
    // a click only preloads modules; a fetch started here could never be
    // reused, since changeRoute looks the cache up in the same task
    expect(prefetchRoute).not.toHaveBeenCalled();
    expect(changeRoute).toHaveBeenCalledTimes(1);
    expect(changeRoute).toHaveBeenCalledWith(
      { path: '/next', query: '', hash: '' },
      expect.objectContaining({
        shouldScroll: true,
        history: 'push',
        url: expect.any(URL),
      }),
    );
    const firstUrl = (
      (changeRoute.mock.calls[0] as unknown[] | undefined)?.[1] as
        { url?: URL } | undefined
    )?.url;
    expect(firstUrl?.href).toContain('/next');

    const altClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    links[0]!.dispatchEvent(altClick);
    expect(changeRoute).toHaveBeenCalledTimes(1);

    const preventedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    links[1]!.dispatchEvent(preventedClick);
    expect(changeRoute).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('Link re-scrolls to the same hash on a repeated click', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    // Same href as the link's resolved target, so `internalOnClick` takes the
    // "no route change" path that previously bailed out entirely.
    window.history.replaceState({}, '', '/start#target');

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    const hashTarget = document.createElement('div');
    hashTarget.id = 'target';
    const getBoundingClientRectSpy = vi
      .spyOn(hashTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 30 } as DOMRect);
    document.body.append(hashTarget);

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '#target' },
          changeRoute,
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link to="/start#target" data-testid="hash-link">
          hash
        </Link>
      </RouterContext>,
    );
    try {
      const link = view.container.querySelector('[data-testid="hash-link"]')!;
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        await Promise.resolve();
      });

      // No route change (the href is unchanged), but it should still scroll.
      expect(changeRoute).not.toHaveBeenCalled();
      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 130,
        behavior: 'auto',
      });
    } finally {
      view.unmount();
      scrollToSpy.mockRestore();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      window.history.replaceState({}, '', '/');
      restoreScrollY();
    }
  });

  test('Link with scroll={false} does not re-scroll on a same-hash click', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    window.history.replaceState({}, '', '/start#target');

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const hashTarget = document.createElement('div');
    hashTarget.id = 'target';
    document.body.append(hashTarget);

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '#target' },
          changeRoute,
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link to="/start#target" scroll={false} data-testid="hash-link">
          hash
        </Link>
      </RouterContext>,
    );
    try {
      const link = view.container.querySelector('[data-testid="hash-link"]')!;
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        await Promise.resolve();
      });

      expect(changeRoute).not.toHaveBeenCalled();
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      scrollToSpy.mockRestore();
      hashTarget.remove();
      window.history.replaceState({}, '', '/');
    }
  });

  test('Link intercepts external, target, and download clicks', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <>
          <Link to="https://example.com/external" data-testid="external-link">
            external
          </Link>
          <Link to="/next" target="_blank" data-testid="target-link">
            target
          </Link>
          <Link to="/next" download data-testid="download-link">
            download
          </Link>
        </>
      </RouterContext>,
    );

    const click = () =>
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
    const externalClick = click();
    const targetClick = click();
    const secondTargetClick = click();
    const downloadClick = click();
    const secondDownloadClick = click();
    view.container
      .querySelector('[data-testid="external-link"]')
      ?.dispatchEvent(externalClick);
    view.container
      .querySelector('[data-testid="target-link"]')
      ?.dispatchEvent(targetClick);
    view.container
      .querySelector('[data-testid="target-link"]')
      ?.dispatchEvent(secondTargetClick);
    view.container
      .querySelector('[data-testid="download-link"]')
      ?.dispatchEvent(downloadClick);
    view.container
      .querySelector('[data-testid="download-link"]')
      ?.dispatchEvent(secondDownloadClick);
    await flush();

    expect(externalClick.defaultPrevented).toBe(true);
    expect(targetClick.defaultPrevented).toBe(true);
    expect(secondTargetClick.defaultPrevented).toBe(true);
    expect(downloadClick.defaultPrevented).toBe(true);
    expect(secondDownloadClick.defaultPrevented).toBe(true);
    expect(prefetchRoute).not.toHaveBeenCalled();
    expect(changeRoute).toHaveBeenCalledTimes(5);
    expect(warnSpy).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Link] `target` is discouraged. Use `<a>` for this case.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[Link] `download` is discouraged. Use `<a>` for this case.',
    );

    view.unmount();
    warnSpy.mockRestore();
  });

  test('Link handles prefetchOnEnter and prefetchOnView', async () => {
    const prefetchRoute = vi.fn();
    const onMouseEnter = vi.fn();

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link
          to="/next"
          unstable_prefetchOnEnter={{}}
          unstable_prefetchOnView={{}}
          onMouseEnter={onMouseEnter}
        >
          next
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(prefetchRoute).toHaveBeenCalledWith(
      {
        path: '/next',
        query: '',
        hash: '',
      },
      {},
    );
    expect(onMouseEnter).toHaveBeenCalledTimes(1);

    const observer = getIntersectionObserverMockInstance();
    expect(observer.observe).toHaveBeenCalledWith(link);
    observer.callback(
      [
        {
          isIntersecting: true,
          target: link,
        } as unknown as IntersectionObserverEntry,
      ],
      observer,
    );
    expect(prefetchRoute).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  test('Link attaches prefetchOnView observer when enabled after mount', async () => {
    const prefetchRoute = vi.fn();

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <PrefetchOnViewToggleLink />
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }

    const ctor = globalThis.IntersectionObserver as unknown as {
      mock?: { calls: unknown[][] };
    };
    expect(ctor.mock?.calls.length ?? 0).toBe(0);

    const enableButton = view.container.querySelector(
      '[data-testid="enable-prefetch-on-view"]',
    );
    if (!(enableButton instanceof HTMLButtonElement)) {
      throw new Error('expected enable button');
    }
    enableButton.click();
    await flush();

    const observer = getIntersectionObserverMockInstance();
    expect(observer.observe).toHaveBeenCalledWith(link);
    view.unmount();
  });

  test('Link ref supports object refs and callback cleanup', async () => {
    const contextValue = {
      route: { path: '/start', query: '', hash: '' },
      changeRoute: vi.fn(async () => {}),
      prefetchRoute: vi.fn(),
      fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
      lazySliceIds: new Set<string>(),
    };

    const objectRef: { current: HTMLAnchorElement | null } = { current: null };
    const callbackCleanup = vi.fn();
    const callbackRef = vi.fn(() => callbackCleanup);

    const objectView = await renderApp(
      <RouterContext value={contextValue}>
        <Link to="/next" ref={objectRef}>
          next
        </Link>
      </RouterContext>,
    );
    expect(objectRef.current?.tagName).toBe('A');
    objectView.unmount();
    expect(objectRef.current).toBeNull();

    const callbackView = await renderApp(
      <RouterContext value={contextValue}>
        <Link to="/next" ref={callbackRef}>
          next
        </Link>
      </RouterContext>,
    );
    callbackView.unmount();

    expect(callbackRef).toHaveBeenCalledTimes(1);
    expect(callbackCleanup).toHaveBeenCalledTimes(1);
  });

  test('Link callback ref without cleanup receives null on unmount', async () => {
    const callbackRef = vi.fn<(node: HTMLAnchorElement | null) => void>();

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link to="/next" ref={callbackRef}>
          next
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    expect(callbackRef).toHaveBeenCalledTimes(1);
    expect(callbackRef).toHaveBeenCalledWith(link);

    view.unmount();

    expect(callbackRef).toHaveBeenCalledTimes(2);
    expect(callbackRef).toHaveBeenLastCalledWith(null);
  });
});

describe('Slice', () => {
  test('throws without a Router', async () => {
    await expect(renderApp(<Slice id="slice-1" />)).rejects.toThrow(
      'Missing Router',
    );
  });

  test('renders existing slice slot', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div data-testid="slice">slice-content</div>,
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Slice id="slice-1" />
      </RouterContext>,
      elements,
    );

    expect(view.container.textContent).toContain('slice-content');
    view.unmount();
  });

  test('lazy slice fetches once, dedupes, and clears the request on completion', async () => {
    const fetchingSlices = new Map<string, Promise<Record<string, unknown>>>();
    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices,
          lazySliceIds: new Set<string>(),
        }}
      >
        <>
          <Slice
            id="slice-1"
            lazy
            fallback={<div data-testid="fallback-1">loading 1</div>}
          />
          <Slice
            id="slice-1"
            lazy
            fallback={<div data-testid="fallback-2">loading 2</div>}
          />
        </>
      </RouterContext>,
      {},
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loading 1');
    expect(view.container.textContent).toContain('loading 2');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith(unstable_encodeSliceId('slice-1'));
    // released when it settles, so the slice can be fetched again later
    expect(fetchingSlices.size).toBe(0);

    view.unmount();
  });

  test('lazy slice skips fetch when static element exists', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div>loaded</div>,
      [`${ETAG_ID_PREFIX}${slotId}`]: IMMUTABLE_ETAG,
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      elements,
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loaded');
    expect(refetch).not.toHaveBeenCalled();

    view.unmount();
  });

  test('lazy slice with existing non-static slot still refetches', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div>loaded</div>,
      [`${ETAG_ID_PREFIX}${slotId}`]: 'v1',
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      elements,
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loaded');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith(unstable_encodeSliceId('slice-1'));

    view.unmount();
  });

  test('logs refetch failures and clears the request', async () => {
    const fetchingSlices = new Map<string, Promise<Record<string, unknown>>>();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('slice failed'));
    installRefetch(refetch);

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          fetchingSlices,
          lazySliceIds: new Set<string>(),
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to fetch slice:',
      expect.any(Error),
    );
    // a failed fetch releases the id too, so a retry is possible
    expect(fetchingSlices.size).toBe(0);

    view.unmount();
  });
});

describe('Router integration', () => {
  const makeProbe = (capture: { router: RouterApi | null }) => {
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const Probe = () => {
      const router = useRouter() as unknown as RouterApi;
      setRouter(router);
      return (
        <div data-testid="route-probe">
          {router.path}|{router.query}|{router.hash}
        </div>
      );
    };
    return Probe;
  };

  test('initializes Root with encoded route and query params', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', 'a=1'],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: 'a=1', hash: '#hash' },
      },
      elements,
    );

    const rootProps = vi.mocked(Root).mock.calls[0]?.[0] as
      Parameters<typeof Root>[0] | undefined;
    expect(rootProps?.initialRscPath).toBe(unstable_encodeRoutePath('/start'));
    const initialParams = rootProps?.initialRscParams as
      URLSearchParams | undefined;
    expect(initialParams).toBeDefined();
    expect(initialParams!.get('query')).toBe('a=1');
    expect(capture.router?.hash).toBe('#hash');

    view.unmount();
  });

  test('uses route data as initial route', async () => {
    window.history.replaceState({}, '', '/missing');

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/404', ''],
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouterInStrictMode({}, elements);
    expect(capture.router?.path).toBe('/404');
    view.unmount();
  });

  test('registers its callServer listener once, and removes it on unmount (StrictMode)', async () => {
    // The store is a module-level singleton; 'l' is CALL_SERVER_ELEMENTS_LISTENERS.
    // NOTE: the etags-header *fetch enhancer* ('f') is no longer owned by the
    // router; it moved into the minimal layer (covered by the minimal
    // carry/replay test). The router keeps only the callServer listener.
    const store = fetchRscStore as unknown as Record<string, unknown>;
    delete store.l;
    const size = (key: string) =>
      (store[key] as Set<unknown> | undefined)?.size ?? 0;

    const elements = {
      [unstable_getRouteSlotId('/start')]: <div>start</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };
    const view = await renderRouterInStrictMode(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );

    // Registered exactly once despite StrictMode's mount/unmount/mount cycle.
    expect(size('l')).toBe(1);

    view.unmount();

    // Fully unregistered on unmount, so nothing leaks into later RSC requests.
    expect(size('l')).toBe(0);
  });

  test('a server function route update keeps the base path', async () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      window.history.replaceState({}, '', '/docs/start');
      const elements = {
        [unstable_getRouteSlotId('/start')]: <div>start</div>,
        [unstable_getRouteSlotId('/next')]: <div>next</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      };
      const view = await renderRouter(
        { initialRoute: { path: '/start', query: '', hash: '' } },
        elements,
      );

      const store = fetchRscStore as unknown as Record<string, unknown>;
      const listeners = store.l as Set<
        (elements: Record<string, unknown>) => void
      >;
      expect(listeners.size).toBe(1);
      await act(async () => {
        for (const listener of listeners) {
          listener({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false });
        }
        await flush();
      });
      await flush();

      expect(window.location.pathname).toBe('/docs/next');

      view.unmount();
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a server function update for the settled route does not navigate', async () => {
    window.history.replaceState({}, '', '/start#section');
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '#section' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    try {
      const store = fetchRscStore as unknown as Record<string, unknown>;
      const listeners = store.l as Set<
        (elements: Record<string, unknown>) => void
      >;
      await act(async () => {
        for (const listener of listeners) {
          listener({ [ROUTE_ID]: ['/start', ''], [IS_STATIC_ID]: false });
        }
        await flush();
      });

      expect(capture.router?.hash).toBe('#section');
      expect(pushStateSpy).not.toHaveBeenCalled();
    } finally {
      pushStateSpy.mockRestore();
      view.unmount();
    }
  });

  test('a server function response marks a static route as static', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );

    const store = fetchRscStore as unknown as Record<string, unknown>;
    const listeners = store.l as Set<
      (elements: Record<string, unknown>) => void
    >;
    await act(async () => {
      for (const listener of listeners) {
        listener({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: true });
      }
      await flush();
    });
    expect(capture.router?.path).toBe('/next');

    await act(async () => {
      await capture.router!.push('/start');
      await flush();
    });
    refetch.mockClear();
    await act(async () => {
      await capture.router!.push('/next');
      await flush();
    });

    // the response said /next is static, so going back to it needs no request
    expect(refetch).not.toHaveBeenCalled();

    view.unmount();
  });

  test('a server function 404 keeps the requested url', async () => {
    window.history.replaceState({}, '', '/start?a=1');
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', 'a=1'],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: 'a=1', hash: '' } },
      elements,
    );

    const store = fetchRscStore as unknown as Record<string, unknown>;
    const listeners = store.l as Set<
      (elements: Record<string, unknown>) => void
    >;
    await act(async () => {
      for (const listener of listeners) {
        listener({ [ROUTE_ID]: ['/404', ''], [IS_STATIC_ID]: false });
      }
      await flush();
    });
    await flush();

    expect(capture.router?.path).toBe('/404');
    expect(window.location.pathname + window.location.search).toBe(
      '/start?a=1',
    );

    view.unmount();
  });

  test('push performs refetch for dynamic routes', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }
    const refetch = getRefetchMock();

    await act(async () => {
      await capture.router!.push('/next?x=1#h');
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(unstable_encodeRoutePath('/next'));
    const params = refetch.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(capture.router.path).toBe('/next');
    expect(capture.router.query).toBe('x=1');
    expect(capture.router.hash).toBe('#h');

    view.unmount();
  });

  test('normal navigation merges only after the fetch resolves', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    installRefetch(vi.fn<RefetchInner>(() => pending.promise));
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    let mergeElements: ReturnType<typeof useMergeElements> | undefined;
    const Content = () => {
      mergeElements = useMergeElements();
      return (
        <>
          <Probe />
          <Slot id="shared" />
        </>
      );
    };
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Content />,
        [unstable_getRouteSlotId('/next')]: <Content />,
        shared: <div>initial</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      let pushed: Promise<void> | undefined;
      await act(async () => {
        pushed = capture.router!.push('/next');
        await Promise.resolve();
      });

      expect(fetchRsc).toHaveBeenCalledTimes(1);
      expect(testHoisted.mergeTypes).toEqual([]);
      expect(capture.router?.path).toBe('/start');
      expect(window.location.pathname).toBe('/start');

      await act(async () => {
        await mergeElements!({ shared: <div>server action</div> });
      });
      expect(view.container.textContent).toContain('server action');
      testHoisted.mergeTypes.length = 0;

      await act(async () => {
        pending.resolve({
          shared: <div>route response</div>,
          [IS_STATIC_ID]: false,
        });
        await pushed;
      });

      expect(testHoisted.mergeTypes).toEqual(['sync']);
      expect(capture.router?.path).toBe('/next');
      expect(window.location.pathname).toBe('/next');
      expect(view.container.textContent).toContain('server action');
      expect(view.container.textContent).not.toContain('route response');
    } finally {
      view.unmount();
    }
  });

  test('query navigation commits its route after an action updates the old query', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    const refetch = installRefetch(vi.fn<RefetchInner>(() => pending.promise));
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const slotId = unstable_getRouteSlotId('/start');
    const etagId = `${ETAG_ID_PREFIX}${slotId}`;
    let mergeElements: ReturnType<typeof useMergeElements> | undefined;
    const Content = ({ label }: { label: string }) => {
      mergeElements = useMergeElements();
      return (
        <>
          <Probe />
          <div data-testid="route-content">{label}</div>
        </>
      );
    };
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [slotId]: <Content label="initial" />,
        [etagId]: 'initial',
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      let pushed: Promise<void> | undefined;
      await act(async () => {
        pushed = capture.router!.push('?x=1');
        await Promise.resolve();
      });
      await act(async () => {
        await mergeElements!({
          [slotId]: <Content label="action" />,
          [etagId]: 'action',
        });
      });

      await act(async () => {
        pending.resolve({
          [slotId]: <Content label="destination" />,
          [etagId]: 'destination',
          [IS_STATIC_ID]: false,
        });
        await pushed;
      });

      expect(capture.router?.query).toBe('x=1');
      expect(view.container.textContent).toContain('destination');
      expect(view.container.textContent).not.toContain('action');

      refetch.mockResolvedValueOnce({
        [slotId]: <Content label="reloaded" />,
        [etagId]: 'reloaded',
        [IS_STATIC_ID]: false,
      });
      await act(async () => {
        await capture.router!.reload();
      });
      expect(refetch.mock.calls[1]?.[2]?.unstable_base?.[etagId]).toBe(
        'destination',
      );
    } finally {
      view.unmount();
    }
  });

  // (Removed) The old test 'committing a route whose slot has not arrived
  // renders nothing instead of crashing' covered the missing-slot guard. The
  // route now derives from the elements' ROUTE_ID, which the server always ships
  // with the matching route slot, so a route ahead of its slot is unrepresentable
  // and the guard is gone.

  test('push accepts a structured target and builds the href', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/posts/hello')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }
    const refetch = getRefetchMock();

    await act(async () => {
      await capture.router!.push({
        to: '/posts/[slug]',
        params: { slug: 'hello' },
        search: { tab: 'comments' },
      });
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(
      unstable_encodeRoutePath('/posts/hello'),
    );
    expect(capture.router.path).toBe('/posts/hello');
    expect(capture.router.query).toBe('tab=comments');

    view.unmount();
  });

  test('link transitions still write committed history after pathname drift', async () => {
    const PendingLabel = () => {
      const { pending } = useNavigationStatus();
      return pending ? <div>Pending...</div> : null;
    };
    const firstNavigation = createDeferred<Record<string, unknown>>();
    const secondNavigation = createDeferred<Record<string, unknown>>();
    const thirdNavigation = createDeferred<Record<string, unknown>>();
    const refetch = vi
      .fn<RefetchInner>()
      .mockImplementationOnce(() => firstNavigation.promise)
      .mockImplementationOnce(() => secondNavigation.promise)
      .mockImplementationOnce(() => thirdNavigation.promise);
    installRefetch(refetch);
    window.history.replaceState({}, '', '/one');

    const view = await renderRouterInStrictMode(
      {
        initialRoute: { path: '/one', query: '', hash: '' },
      },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Link to="/two">
              Go to two
              <PendingLabel />
            </Link>
          </>
        ),
        [unstable_getRouteSlotId('/two')]: (
          <>
            <h1>Page 2</h1>
            <Link to="/three">
              Go to three
              <PendingLabel />
            </Link>
          </>
        ),
        [unstable_getRouteSlotId('/three')]: (
          <>
            <h1>Page 3</h1>
            <Link to="/two">
              Go back to two
              <PendingLabel />
            </Link>
          </>
        ),
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      const clickLink = async (text: string) => {
        const link = Array.from(view.container.querySelectorAll('a')).find(
          (anchor) => anchor.textContent === text,
        ) as HTMLAnchorElement | undefined;
        if (!link) {
          throw new Error(`Link not found: ${text}`);
        }
        await act(async () => {
          link.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
          await Promise.resolve();
        });
      };

      expect(window.location.pathname).toBe('/one');
      expect(view.container.textContent).toContain('Page 1');

      await clickLink('Go to two');
      expect(view.container.textContent).toContain('Pending...');
      expect(view.container.textContent).toContain('Page 1');
      expect(window.location.pathname).toBe('/one');

      firstNavigation.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
      });
      await flush();

      expect(view.container.textContent).toContain('Page 2');
      expect(window.location.pathname).toBe('/two');

      await clickLink('Go to three');
      expect(view.container.textContent).toContain('Pending...');
      expect(view.container.textContent).toContain('Page 2');
      expect(window.location.pathname).toBe('/two');
      window.history.replaceState({}, '', '/one');
      expect(window.location.pathname).toBe('/one');

      secondNavigation.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
      });
      await flush();

      expect(view.container.textContent).toContain('Page 3');
      expect(window.location.pathname).toBe('/three');

      await clickLink('Go back to two');
      expect(view.container.textContent).toContain('Pending...');
      expect(view.container.textContent).toContain('Page 3');
      expect(window.location.pathname).toBe('/three');

      thirdNavigation.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
      });
      await flush();

      expect(view.container.textContent).toContain('Page 2');
      expect(window.location.pathname).toBe('/two');
    } finally {
      view.unmount();
    }
  });

  test('push to a new path with hash scrolls using destination hash after history write', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const NextRoute = () => (
      <>
        <Probe />
        <div id="target">target</div>
      </>
    );
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <NextRoute />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollSnapshots: Array<{ pathname: string; hash: string }> = [];
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      scrollSnapshots.push({
        pathname: window.location.pathname,
        hash: window.location.hash,
      });
    });
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.id === 'target') {
          return { top: 40 } as DOMRect;
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      document.body.append(view.container);
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/next#target');
      });
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 140,
        behavior: 'instant',
      });
      expect(scrollSnapshots).toEqual([
        {
          pathname: '/next',
          hash: '#target',
        },
      ]);
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('a server rewrite drops a hash target the response did not keep', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const nextSlotId = unstable_getRouteSlotId('/next');
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              [unstable_getRouteSlotId('/rewritten')]: (
                <>
                  <Probe />
                  <div id="intro">intro</div>
                </>
              ),
              [ROUTE_ID]: ['/rewritten', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [nextSlotId]: <div>shell</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
        [`${ETAG_ID_PREFIX}${nextSlotId}`]: IMMUTABLE_ETAG,
      },
    );
    try {
      document.body.append(view.container);
      const pushed = capture.router!.push('/next#intro', {
        unstable_instant: true,
      });
      await act(async () => {
        await flush();
      });
      scrollToSpy.mockClear();

      // the rewritten route has an #intro of its own, but it was never asked for
      await act(async () => {
        land!();
        await pushed;
        await flush();
      });

      expect(capture.router!.path).toBe('/rewritten');
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.container.remove();
      view.unmount();
      scrollToSpy.mockRestore();
    }
  });

  test('a named element that is not an anchor is not a hash target', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: (
          <>
            <Probe />
            <input name="section" readOnly />
          </>
        ),
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      document.body.append(view.container);
      await act(async () => {
        await capture.router!.push('/next');
        await flush();
      });
      scrollToSpy.mockClear();

      // same path, so a real target would scroll and a miss does nothing
      await act(async () => {
        await capture.router!.push('/next#section');
        await flush();
      });

      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.container.remove();
      view.unmount();
      scrollToSpy.mockRestore();
    }
  });

  test('a later navigation drops a hash target that never arrived', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const MergeButton = () => {
      const mergeElements = useMergeElements();
      return (
        <button
          data-testid="merge-late"
          onClick={() => void mergeElements(fetchRsc('late'))}
        />
      );
    };
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/a')]: (
          <>
            <Probe />
            <MergeButton />
          </>
        ),
        [unstable_getRouteSlotId('/b')]: (
          <>
            <Probe />
            <MergeButton />
            <Slot id="late" />
          </>
        ),
        late: <div>nothing yet</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      document.body.append(view.container);
      // the target never shows up on /a
      await act(async () => {
        await capture.router!.push('/a#target');
        await flush();
      });
      await act(async () => {
        await capture.router!.push('/b', { scroll: false });
        await flush();
      });
      scrollToSpy.mockClear();

      refetch.mockResolvedValueOnce({ late: <div id="target">target</div> });
      await act(async () => {
        view.container
          .querySelector<HTMLButtonElement>('[data-testid="merge-late"]')
          ?.click();
        await flush();
      });

      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.container.remove();
      view.unmount();
      scrollToSpy.mockRestore();
    }
  });

  test('a reader who scrolls is not pulled to a late hash target', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const nextSlotId = unstable_getRouteSlotId('/next');
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              extra: <div id="target">target</div>,
              [ROUTE_ID]: ['/next', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [nextSlotId]: (
          <>
            <Probe />
            <Slot id="extra" />
          </>
        ),
        extra: <div>placeholder</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
        [`${ETAG_ID_PREFIX}${nextSlotId}`]: IMMUTABLE_ETAG,
      },
    );
    try {
      document.body.append(view.container);
      const pushed = capture.router!.push('/next#target', {
        unstable_instant: true,
      });
      await act(async () => {
        await flush();
      });
      scrollToSpy.mockClear();

      // the reader takes over before the target arrives
      window.dispatchEvent(new Event('wheel'));
      await act(async () => {
        land!();
        await pushed;
        await flush();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(document.getElementById('target')).not.toBeNull();
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.container.remove();
      view.unmount();
      scrollToSpy.mockRestore();
    }
  });

  test('a malformed escape does not spoil the rest of a hash target', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return { top: this.id === 'foo bar%ZZ' ? 40 : 0 } as DOMRect;
      });
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: (
          <>
            <Probe />
            <div id="foo bar%ZZ">target</div>
          </>
        ),
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      document.body.append(view.container);
      // %20 decodes, %ZZ is not an escape and stays as written
      await act(async () => {
        await capture.router!.push('/next#foo%20bar%ZZ');
        await flush();
      });

      expect(scrollToSpy).toHaveBeenLastCalledWith({
        left: 0,
        top: 140,
        behavior: 'instant',
      });
    } finally {
      view.container.remove();
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      scrollToSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('a percent encoded #top still means the top of the document', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return {
          top: this === document.documentElement ? -100 : 0,
        } as DOMRect;
      });
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      document.body.append(view.container);
      await act(async () => {
        await capture.router!.push('/next');
        await flush();
      });
      scrollToSpy.mockClear();

      await act(async () => {
        await capture.router!.push('/next#%74op');
        await flush();
      });

      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        left: 0,
        top: 0,
        behavior: 'auto',
      });
    } finally {
      view.container.remove();
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      scrollToSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('a hash target can be an old style name anchor', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return {
          top: this.getAttribute('name') === 'target' ? 40 : 0,
        } as DOMRect;
      });
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    const anchor = document.createElement('a');
    anchor.setAttribute('name', 'target');
    try {
      document.body.append(view.container);
      document.body.append(anchor);
      await act(async () => {
        await capture.router!.push('/next#target');
        await flush();
      });

      expect(scrollToSpy).toHaveBeenLastCalledWith({
        left: 0,
        top: 140,
        behavior: 'instant',
      });
    } finally {
      anchor.remove();
      view.container.remove();
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      scrollToSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('a #top hash with no such element means the top of the document', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        // the document is scrolled down, so the root starts above the viewport
        return {
          top: this === document.documentElement ? -100 : 0,
        } as DOMRect;
      });
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      document.body.append(view.container);
      await act(async () => {
        await capture.router!.push('/next');
        await flush();
      });
      scrollToSpy.mockClear();

      // same path, so a missing target would not fall back to the top
      await act(async () => {
        await capture.router!.push('/next#top');
        await flush();
      });

      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        left: 0,
        top: 0,
        behavior: 'auto',
      });
    } finally {
      view.container.remove();
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      scrollToSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('push to a new path with hash applies scroll-margin-top offset', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const NextRoute = () => (
      <>
        <Probe />
        <div id="target" style={{ scrollMarginTop: '24px' }}>
          target
        </div>
      </>
    );
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <NextRoute />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.id === 'target') {
          return { top: 40 } as DOMRect;
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      document.body.append(view.container);
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/next#target');
      });
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 116,
        behavior: 'instant',
      });
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('query-only push preserves scroll by default', async () => {
    window.history.replaceState({}, '', '/start?a=1');

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', 'a=1'],
      [IS_STATIC_ID]: false,
    };
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: 'a=1', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/start?a=2');
      });

      expect(capture.router.query).toBe('a=2');
      expect(window.location.pathname).toBe('/start');
      expect(window.location.search).toBe('?a=2');
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  test('hash-only push scrolls to hash target by default', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    const hashTarget = document.createElement('div');
    hashTarget.id = 'target';
    const getBoundingClientRectSpy = vi
      .spyOn(hashTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 30 } as DOMRect);
    document.body.append(hashTarget);

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/start#target');
      });

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 130,
        behavior: 'auto',
      });
      expect(window.location.hash).toBe('#target');
      expect(capture.router.hash).toBe('#target');
      // the hash never reaches the server, so there is nothing to fetch
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      restoreScrollY();
    }
  });

  test('hash-only push scrolls to a percent-encoded (non-ASCII) hash target', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    // `%E6%97%A5...` is the percent-encoded form of the id "日本語見出し", which
    // is how `URL.hash` (and therefore `route.hash`) represents a non-ASCII
    // fragment. Use the encoded form explicitly so the test reproduces the bug
    // regardless of how the test environment's URL parser encodes the fragment.
    const encodedHash =
      '%E6%97%A5%E6%9C%AC%E8%AA%9E%E8%A6%8B%E5%87%BA%E3%81%97';
    const decodedId = '日本語見出し';
    const hashTarget = document.createElement('div');
    hashTarget.id = decodedId;
    const getBoundingClientRectSpy = vi
      .spyOn(hashTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 30 } as DOMRect);
    document.body.append(hashTarget);

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push(`/start#${encodedHash}`);
      });

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 130,
        behavior: 'auto',
      });
      expect(decodeURIComponent(window.location.hash)).toBe(`#${decodedId}`);
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      restoreScrollY();
    }
  });

  test('hash-only push prefers the raw hash id over the decoded id', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    // Per the HTML fragment navigation algorithm, the raw fragment must be
    // tried first and the percent-decoded form only as a fallback. With both
    // ids present, `#a%20b` must scroll to `id="a%20b"`, not `id="a b"`.
    const rawTarget = document.createElement('div');
    rawTarget.id = 'a%20b';
    const decodedTarget = document.createElement('div');
    decodedTarget.id = 'a b';
    const rawRectSpy = vi
      .spyOn(rawTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 30 } as DOMRect);
    const decodedRectSpy = vi
      .spyOn(decodedTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 500 } as DOMRect);
    document.body.append(rawTarget, decodedTarget);

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/start#a%20b');
      });

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 130,
        behavior: 'auto',
      });
    } finally {
      view.unmount();
      rawRectSpy.mockRestore();
      decodedRectSpy.mockRestore();
      rawTarget.remove();
      decodedTarget.remove();
      restoreScrollY();
    }
  });

  test('hash-only push preserves scroll when hash target is missing', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/start#missing');
      });

      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('#missing');
      expect(capture.router.hash).toBe('#missing');
    } finally {
      view.unmount();
    }
  });

  test('path change push with scroll false preserves scroll position', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await capture.router!.push('/next', { scroll: false });
      });

      expect(capture.router.path).toBe('/next');
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  test('push writes history and renders the error when refetch fails', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('refetch failed'));
    installRefetch(refetch);
    const historyPushSpy = vi.spyOn(window.history, 'pushState');

    const elements = {
      root: (
        <>
          <Probe />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      [unstable_getRouteSlotId('/start')]: <p>start</p>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    testHoisted.elements = elements;
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        await expect(capture.router!.push('/next')).rejects.toThrow(
          'refetch failed',
        );
        await flush();
      });
      expect(historyPushSpy).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe('/next');
      expect(capture.router.path).toBe('/next');
      expect(view.container.textContent).toContain(
        'Caught an unexpected error',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('push skips refetch for static routes', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }
    const refetch = getRefetchMock();

    await act(async () => {
      await capture.router!.push('/start?x=2');
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(capture.router.query).toBe('x=2');

    view.unmount();
  });

  test('prefetch skips static route and preloads modules for dynamic route', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };

    const prefetchHook = vi.fn(
      (path: string, callback: (id: string) => void) => {
        callback(`/assets/${path}.js`);
      },
    );
    (globalThis as Record<string, unknown>).__WAKU_ROUTER_PREFETCH__ =
      prefetchHook;

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }

    capture.router.prefetch('/start');
    expect(prefetchRsc).not.toHaveBeenCalled();

    capture.router.prefetch('/next?x=1');
    expect(prefetchRsc).toHaveBeenCalledTimes(1);
    expect(prefetchRsc.mock.calls[0]?.[0]).toBe(
      unstable_encodeRoutePath('/next'),
    );
    const params = prefetchRsc.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(prefetchHook).toHaveBeenCalledWith('/next', expect.any(Function));
    expect(preloadModule).toHaveBeenCalledWith('/assets//next.js', {
      as: 'script',
    });

    view.unmount();
  });

  test('a build mismatch drops an idle prefetch without reloading', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    prefetchRsc.mockReturnValue(pending.promise);
    const refetch = installRefetch(
      vi.fn<RefetchInner>(async () => ({
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      })),
    );
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    const reloadSpy = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {});
    try {
      capture.router!.prefetch('/next');
      prefetchRsc.mock.calls[0]?.[2]?.onBuildIdMismatch?.();

      expect(window.location.pathname).toBe('/start');
      expect(reloadSpy).not.toHaveBeenCalled();

      await act(async () => {
        await capture.router!.push('/next');
      });
      expect(refetch).toHaveBeenCalledOnce();
    } finally {
      pending.resolve({});
      reloadSpy.mockRestore();
      view.unmount();
    }
  });

  test('a build mismatch reloads the target of an adopted prefetch', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    prefetchRsc.mockReturnValue(pending.promise);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    const reloadSpy = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {});
    try {
      capture.router!.prefetch('/next');
      const navigation = capture.router!.push('/next');
      await Promise.resolve();

      prefetchRsc.mock.calls[0]?.[2]?.onBuildIdMismatch?.();

      expect(window.location.pathname).toBe('/next');
      expect(reloadSpy).toHaveBeenCalledOnce();

      pending.resolve({
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      });
      await act(async () => {
        await navigation;
      });
    } finally {
      pending.resolve({});
      reloadSpy.mockRestore();
      view.unmount();
    }
  });

  test('a hover prefetch without a router is a no-op', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      await act(async () => {
        root.render(
          <Link to="/next" unstable_prefetchOnEnter={{}}>
            next
          </Link>,
        );
      });
      const anchor = container.querySelector('a');
      if (!anchor) {
        throw new Error('anchor not rendered');
      }
      await act(async () => {
        anchor.dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true, cancelable: true }),
        );
      });
      expect(errors).toEqual([]);
      expect(prefetchRsc).not.toHaveBeenCalled();
      act(() => root.unmount());
    } finally {
      window.removeEventListener('error', onError);
      container.remove();
    }
  });

  test('a hover prefetch skips a link that only adds a hash', async () => {
    const prefetchRoute = vi.fn();
    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link to="/start#target" unstable_prefetchOnEnter={{}}>
          target
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // the hash never reaches the server, so there is nothing to prefetch
    expect(prefetchRoute).not.toHaveBeenCalled();

    view.unmount();
  });

  test('a hover prefetch compares with the route on screen, not the address bar', async () => {
    // an interceptor or a failed navigation leaves the two apart
    window.history.replaceState({}, '', '/blocked');
    const prefetchRoute = vi.fn();
    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute,
          fetchingSlices: new Map<string, Promise<Record<string, unknown>>>(),
          lazySliceIds: new Set<string>(),
        }}
      >
        <Link to="/start#target" unstable_prefetchOnEnter={{}}>
          shown
        </Link>
        <Link to="/blocked#target" unstable_prefetchOnEnter={{}}>
          in the url
        </Link>
      </RouterContext>,
    );

    const links = view.container.querySelectorAll('a');
    links[0]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(prefetchRoute).not.toHaveBeenCalled();

    links[1]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(prefetchRoute).toHaveBeenCalledWith(
      { path: '/blocked', query: '', hash: '#target' },
      {},
    );

    view.unmount();
  });

  // The instant shell: a cached prefetch is the navigation's data source,
  // while the eager merge paints the static shell and the base.
  const instantNavElements = () => ({
    [unstable_getRouteSlotId('/start')]: <div>start</div>,
    [unstable_getRouteSlotId('/next')]: <div>next</div>,
    [ROUTE_ID]: ['/start', ''],
    [IS_STATIC_ID]: false,
    // mark /next's route slot static so the instant branch engages
    [`${ETAG_ID_PREFIX}${unstable_getRouteSlotId('/next')}`]: IMMUTABLE_ETAG,
  });

  test('instant Link bypasses a custom transition for a known static route', async () => {
    const customTransition = vi.fn<(fn: () => void) => void>();
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: (
          <Link
            to="/start?updated=1"
            unstable_instant
            unstable_startTransition={customTransition}
          >
            update query
          </Link>
        ),
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: true,
      },
    );

    try {
      await act(async () => {
        view.container.querySelector('a')?.click();
        await flush();
      });

      expect(customTransition).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?updated=1');
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  test('instant Link still pending when it cannot paint from cache', async () => {
    const navigation = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<RefetchInner>(() => navigation.promise);
    installRefetch(refetch);
    window.history.replaceState({}, '', '/one');

    const PendingProbe = () => {
      const { pending } = useNavigationStatus();
      return pending ? (
        <div data-testid="pending">Pending</div>
      ) : (
        <div data-testid="not-pending">Idle</div>
      );
    };

    const view = await renderRouter(
      { initialRoute: { path: '/one', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Link to="/two" unstable_instant>
              Go to two
              <PendingProbe />
            </Link>
          </>
        ),
        [unstable_getRouteSlotId('/two')]: <h1>Page 2</h1>,
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      const has = (testid: string) =>
        view.container.querySelector(`[data-testid="${testid}"]`) !== null;

      expect(has('not-pending')).toBe(true);

      const link = Array.from(view.container.querySelectorAll('a')).find(
        (anchor) => anchor.textContent?.includes('Go to two'),
      ) as HTMLAnchorElement | undefined;
      if (!link) {
        throw new Error('expected link');
      }
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(has('pending')).toBe(true);
      expect(has('not-pending')).toBe(false);
      expect(view.container.textContent).toContain('Page 1');

      await act(async () => {
        navigation.resolve({
          [unstable_getRouteSlotId('/two')]: <h1>Page 2</h1>,
          [ROUTE_ID]: ['/two', ''],
          [IS_STATIC_ID]: false,
        });
        await flush();
      });

      expect(view.container.textContent).toContain('Page 2');
      expect(has('pending')).toBe(false);
    } finally {
      view.unmount();
    }
  });

  test('instant hash-only Link does not fetch and lands on the hash', async () => {
    window.history.replaceState({}, '', '/one');

    const PendingProbe = () => {
      const { pending } = useNavigationStatus();
      return pending ? (
        <div data-testid="pending">Pending</div>
      ) : (
        <div data-testid="not-pending">Idle</div>
      );
    };

    const view = await renderRouter(
      { initialRoute: { path: '/one', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Link to="/one#target" unstable_instant>
              Jump
              <PendingProbe />
            </Link>
          </>
        ),
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      const has = (testid: string) =>
        view.container.querySelector(`[data-testid="${testid}"]`) !== null;

      expect(has('not-pending')).toBe(true);

      const link = Array.from(view.container.querySelectorAll('a')).find(
        (anchor) => anchor.textContent?.includes('Jump'),
      ) as HTMLAnchorElement | undefined;
      if (!link) {
        throw new Error('expected link');
      }
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      expect(has('pending')).toBe(false);
      expect(has('not-pending')).toBe(true);
      expect(window.location.hash).toBe('#target');
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  test('superseding an uncached instant navigation settles both promises', async () => {
    const slow = createDeferred<Record<string, unknown>>();
    const refetch = vi
      .fn<RefetchInner>()
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        const superseded = capture.router!.push('/slow', {
          unstable_instant: true,
        });
        await Promise.resolve();
        const active = capture.router!.push('/next');
        await Promise.all([superseded, active]);
      });

      expect(capture.router.path).toBe('/next');
    } finally {
      slow.resolve({ [ROUTE_ID]: ['/slow', ''], [IS_STATIC_ID]: false });
      view.unmount();
    }
  });

  test('instant nav reuses a prefetched response as data source and base', async () => {
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    installRefetch(refetch);

    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    };
    const shellPromise = resolvedThenable(shell);
    prefetchRsc.mockReturnValue(shellPromise);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    // Warm the prefetch cache and let it settle.
    await act(async () => {
      capture.router!.prefetch('/next');
      await flush();
    });

    await act(async () => {
      await capture.router!.push('/next', { unstable_instant: true });
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(testHoisted.mergeOptions).toContainEqual(
      expect.objectContaining({
        unstable_overlay: expect.objectContaining({
          [ROUTE_ID]: ['/next', ''],
        }),
        unstable_swr: {
          pin: expect.any(Function),
          base: shell,
        },
      }),
    );

    view.unmount();
  });

  test('instant nav paints the target and writes the url before the response', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<RefetchInner>(() => pending.promise);
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    let pushed: Promise<void> | undefined;
    await act(async () => {
      pushed = capture.router!.push('/next', { unstable_instant: true });
      await flush();
    });

    expect(window.location.pathname).toBe('/next');
    expect(capture.router?.path).toBe('/next');

    await act(async () => {
      pending.resolve({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: true });
      await pushed;
      await flush();
    });

    expect(window.location.pathname).toBe('/next');

    view.unmount();
  });

  test('a failed instant nav keeps the attempted route and settled fetch baseline', async () => {
    window.history.replaceState({}, '', '/start?a=1#top');
    const pending = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<RefetchInner>(() => pending.promise);
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const historyPushSpy = vi.spyOn(window.history, 'pushState');
    const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    testHoisted.elements = {
      ...instantNavElements(),
      [ROUTE_ID]: ['/start', 'a=1'],
      root: (
        <>
          <Probe />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
    };
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <Router initialRoute={{ path: '/start', query: 'a=1', hash: '#top' }} />
      </Unstable_SearchCodecsProvider>,
    );
    try {
      historyPushSpy.mockClear();
      historyReplaceSpy.mockClear();
      let navigation: Promise<void> | undefined;
      await act(async () => {
        navigation = capture.router!.push('/next?b=2#bottom', {
          unstable_instant: true,
        });
        await flush();
      });
      expect(capture.router).toMatchObject({
        path: '/next',
        query: 'b=2',
        hash: '#bottom',
      });
      scrollToSpy.mockClear();

      await act(async () => {
        pending.reject(new Error('offline'));
        await expect(navigation).rejects.toThrow('offline');
        await flush();
      });

      expect(capture.router).toMatchObject({
        path: '/next',
        query: 'b=2',
        hash: '#bottom',
      });
      expect(window.location.pathname).toBe('/next');
      expect(window.location.search).toBe('?b=2');
      expect(window.location.hash).toBe('#bottom');
      expect(historyPushSpy).toHaveBeenCalledTimes(1);
      expect(historyReplaceSpy).not.toHaveBeenCalled();
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(view.container.textContent).toContain(
        'Caught an unexpected error',
      );

      refetch.mockResolvedValueOnce({
        [ROUTE_ID]: ['/start', 'b=2'],
        [IS_STATIC_ID]: false,
      });
      await act(async () => {
        await capture.router!.push('/start?b=2').catch(() => {});
        await flush();
      });
      expect(refetch).toHaveBeenCalledTimes(2);
    } finally {
      consoleErrorSpy.mockRestore();
      historyPushSpy.mockRestore();
      historyReplaceSpy.mockRestore();
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('a fetch redirect after an instant paint replaces its history entry', async () => {
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockRejectedValueOnce(
        createCustomError('moved', { status: 307, location: '/final' }),
      )
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/final', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        ...instantNavElements(),
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [unstable_getRouteSlotId('/final')]: <Probe />,
      },
    );
    try {
      const lengthBefore = window.history.length;

      await act(async () => {
        await capture.router!.push('/next', { unstable_instant: true });
        await flush();
      });

      expect(refetch).toHaveBeenCalledTimes(2);
      expect(capture.router?.path).toBe('/final');
      expect(window.location.pathname).toBe('/final');
      expect(window.history.length).toBe(lengthBefore + 1);
    } finally {
      view.unmount();
    }
  });

  test('a redirect after the url already moved replaces instead of pushing', async () => {
    const assignSpy = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => {});
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    // an instant commit writes the requested url before the response lands
    window.history.replaceState({}, '', '/next?x=1');
    const refetch = vi.fn<RefetchInner>(() =>
      Promise.reject(
        createCustomError('moved', {
          status: 307,
          location: 'https://other.example/login',
        }),
      ),
    );
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    const lengthBefore = window.history.length;
    await act(async () => {
      await capture.router!.push('/next?x=1').catch(() => {});
      await flush();
    });

    // that entry already exists, so the redirect must not add another
    expect(window.history.length).toBe(lengthBefore);
    expect(assignSpy).not.toHaveBeenCalled();
    expect(replaceLocationSpy).toHaveBeenCalledTimes(1);
    expect(replaceLocationSpy.mock.calls[0]![0]).toContain('/login');

    assignSpy.mockRestore();
    replaceLocationSpy.mockRestore();
    view.unmount();
  });

  test('an instant nav to a static route keeps the query', async () => {
    // A static payload does not echo the query. The meta the eager pass pins
    // is the route being left, so without a refresh the record would call this
    // a server redirect and drop ?x=1 from the address bar.
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      await capture.router!.push('/next?x=1', { unstable_instant: true });
      await flush();
      await flush();
    });

    expect(capture.router.path).toBe('/next');
    expect(capture.router.query).toBe('x=1');
    expect(window.location.pathname + window.location.search).toBe('/next?x=1');

    view.unmount();
  });

  test('an instant nav from a static route does not mark the target static', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: false,
    }));
    refetch.mockImplementationOnce(() => pending.promise);
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      // the route being left is static, the instant target is not
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    // the instant commit lands before the response: /next's route id sits next
    // to /start's pinned static flag
    let pushed: Promise<void> | undefined;
    await act(async () => {
      pushed = capture.router!.push('/next', { unstable_instant: true });
      await flush();
    });
    await act(async () => {
      pending.resolve({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false });
      await pushed;
      await flush();
    });
    await act(async () => {
      await capture.router!.push('/start');
      await flush();
    });
    refetch.mockClear();
    await act(async () => {
      await capture.router!.push('/next');
      await flush();
    });

    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.anything(),
    );

    view.unmount();
  });

  // Adoption is not instant-gated: an in-flight prefetch is the data source
  // for both instant and non-instant navigations (avoids a duplicate fetch).
  for (const instant of [true, false] as const) {
    test(`${instant ? 'instant' : 'non-instant'} nav adopts an in-flight prefetch as its data source`, async () => {
      const refetch = vi.fn<RefetchInner>(async () => ({
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: true,
      }));
      installRefetch(refetch);

      // Still in flight at navigation time: it started earlier than a fresh
      // request could, so the navigation adopts it instead of duplicating it.
      const pending = createDeferred<Record<string, unknown>>();
      prefetchRsc.mockReturnValue(pending.promise);

      const capture = { router: null as RouterApi | null };
      const Probe = makeProbe(capture);
      const elements = {
        ...instantNavElements(),
        [unstable_getRouteSlotId('/start')]: <Probe />,
      };

      const view = await renderRouter(
        { initialRoute: { path: '/start', query: '', hash: '' } },
        elements,
      );
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await act(async () => {
        capture.router!.prefetch('/next');
      });
      await act(async () => {
        const pushed = capture.router!.push(
          '/next',
          instant ? { unstable_instant: true } : undefined,
        );
        pending.resolve({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: true });
        await pushed;
      });

      expect(refetch).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/next');

      view.unmount();
    });
  }

  test('superseding a navigation releases an adopted prefetch', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    prefetchRsc.mockReturnValue(pending.promise);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      await act(async () => {
        capture.router!.prefetch('/slow');
      });
      await act(async () => {
        const superseded = capture.router!.push('/slow');
        await Promise.resolve();
        const active = capture.router!.push('/next');
        await Promise.all([superseded, active]);
      });

      expect(capture.router?.path).toBe('/next');
    } finally {
      pending.resolve({});
      view.unmount();
    }
  });

  test('instant nav does not reuse a prefetch for a different query', async () => {
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    installRefetch(refetch);

    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    };
    prefetchRsc.mockReturnValue(resolvedThenable(shell));

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    // Prefetch the target for one query, then instant-navigate with another.
    await act(async () => {
      capture.router!.prefetch('/next?q=a');
      await flush();
    });
    await act(async () => {
      await capture.router!.push('/next?q=b', { unstable_instant: true });
    });

    // The q=a response must not become the q=b navigation's data source.
    // It may still ride along as the base: its statics cannot vary by query
    // and its dynamic slots are only served under a matching etag.
    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.objectContaining({ unstable_base: shell }),
    );

    view.unmount();
  });

  test('mode once fetches a route only once per session', async () => {
    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [`${ETAG_ID_PREFIX}${unstable_getRouteSlotId('/next')}`]: IMMUTABLE_ETAG,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: false,
    };
    prefetchRsc.mockReturnValue(resolvedThenable(shell));

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      capture.router!.prefetch('/next', { mode: 'once' });
      await flush();
    });
    await act(async () => {
      // a repeat trigger, even for a different query, is deduped by rscPath
      capture.router!.prefetch('/next?q=a', { mode: 'once' });
      await flush();
    });

    expect(prefetchRsc).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('the prefetch cache survives an unrelated re-render', async () => {
    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: false,
    };
    prefetchRsc.mockReturnValue(resolvedThenable(shell));

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const bump = { fn: null as null | (() => void) };
    const Bump = () => {
      const [, setN] = useState(0);
      bump.fn = () => setN((n) => n + 1);
      return (
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      );
    };
    testHoisted.elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };
    const view = await renderApp(<Bump />);
    try {
      await act(async () => {
        capture.router!.prefetch('/next', { mode: 'once' });
        await flush();
      });
      await act(async () => {
        bump.fn!();
        await flush();
      });
      await act(async () => {
        capture.router!.prefetch('/next?q=a', { mode: 'once' });
        await flush();
      });

      // a per render manager would forget the first prefetch and fetch again
      expect(prefetchRsc).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  });

  test('a repeat prefetch claims the stored response as its base', async () => {
    const first = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: false,
    };
    prefetchRsc.mockReturnValue(resolvedThenable(first));

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      capture.router!.prefetch('/next');
      await flush();
    });
    expect(prefetchRsc.mock.calls.at(0)?.[2]).toEqual({
      onBuildIdMismatch: expect.any(Function),
    });

    await act(async () => {
      capture.router!.prefetch('/next?q=b');
      await flush();
    });
    expect(prefetchRsc.mock.calls.at(1)?.[2]).toEqual({
      onBuildIdMismatch: expect.any(Function),
      unstable_base: expect.objectContaining({
        [unstable_getRouteSlotId('/next')]: expect.anything(),
      }),
    });

    view.unmount();
  });

  test('mode once dedupes concurrent prefetches by rscPath', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    prefetchRsc.mockReturnValue(pending.promise);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      // the first request is still in flight when the second trigger fires
      capture.router!.prefetch('/next?q=a', { mode: 'once' });
      capture.router!.prefetch('/next?q=b', { mode: 'once' });
    });

    expect(prefetchRsc).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('an evicted route can be warmed once again', async () => {
    // The store is bounded, so "once" holds while the route stays in it: a
    // route evicted by newer prefetches is fetched again on a later trigger.
    prefetchRsc.mockImplementation(((rscPath: string) =>
      resolvedThenable({
        [ROUTE_ID]: [rscPath, ''],
        [IS_STATIC_ID]: false,
      })) as never);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      for (let i = 0; i < PREFETCH_LIMIT + 1; i += 1) {
        capture.router!.prefetch(`/p${i}`, { mode: 'once' });
      }
      await flush();
    });
    expect(prefetchRsc).toHaveBeenCalledTimes(PREFETCH_LIMIT + 1);

    await act(async () => {
      // /p0 was evicted by the overflowing prefetches above
      capture.router!.prefetch('/p0', { mode: 'once' });
      await flush();
    });
    expect(prefetchRsc).toHaveBeenCalledTimes(PREFETCH_LIMIT + 2);

    view.unmount();
  });

  test('mode once retries after a failed prefetch', async () => {
    prefetchRsc
      .mockImplementationOnce(() => Promise.reject(new Error('network')))
      .mockReturnValueOnce(
        resolvedThenable({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false }),
      );

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      capture.router!.prefetch('/next', { mode: 'once' });
      await flush();
    });
    await act(async () => {
      capture.router!.prefetch('/next?q=b', { mode: 'once' });
      await flush();
    });

    expect(prefetchRsc).toHaveBeenCalledTimes(2);

    view.unmount();
  });

  test('prefetch honors a per-call ttl', async () => {
    prefetchRsc.mockReturnValue(
      resolvedThenable({ [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false }),
    );
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      ...instantNavElements(),
      [unstable_getRouteSlotId('/start')]: <Probe />,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      capture.router!.prefetch('/next', { ttl: 100 });
      await flush();
    });
    await act(async () => {
      // within the ttl: deduped
      capture.router!.prefetch('/next', { ttl: 100 });
      await flush();
    });
    expect(prefetchRsc).toHaveBeenCalledTimes(1);

    dateNow.mockReturnValue(now + 200);
    await act(async () => {
      // after the ttl: fetched again
      capture.router!.prefetch('/next', { ttl: 100 });
      await flush();
    });
    expect(prefetchRsc).toHaveBeenCalledTimes(2);

    dateNow.mockRestore();
    view.unmount();
  });

  test('instant nav serves stored statics on a first visit', async () => {
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/fresh', ''],
      [IS_STATIC_ID]: false,
    }));
    installRefetch(refetch);

    const freshSlotId = unstable_getRouteSlotId('/fresh');
    const shell = {
      [freshSlotId]: <div>fresh-shell</div>,
      [`${ETAG_ID_PREFIX}${freshSlotId}`]: IMMUTABLE_ETAG,
      [ROUTE_ID]: ['/fresh', ''],
      [IS_STATIC_ID]: false,
    };
    prefetchRsc.mockReturnValue(resolvedThenable(shell));
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    // /fresh has no static etag in the live elements, so the instant gate
    // can only pass through the store
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [freshSlotId]: <div>fresh-live</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      capture.router!.prefetch('/fresh', { ttl: 100 });
      await flush();
    });
    // the prefetched response expires; the learned statics do not
    dateNow.mockReturnValue(now + 200);
    await act(async () => {
      await capture.router!.push('/fresh', { unstable_instant: true });
    });

    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/fresh'),
      expect.any(URLSearchParams),
      expect.objectContaining({
        unstable_base: expect.objectContaining({
          [freshSlotId]: expect.anything(),
          [`${ETAG_ID_PREFIX}${freshSlotId}`]: IMMUTABLE_ETAG,
        }),
      }),
    );
    expect(testHoisted.mergeOptions).toContainEqual(
      expect.objectContaining({
        unstable_swr: expect.objectContaining({
          base: expect.objectContaining({
            [freshSlotId]: expect.anything(),
            [`${ETAG_ID_PREFIX}${freshSlotId}`]: IMMUTABLE_ETAG,
          }),
        }),
      }),
    );

    dateNow.mockRestore();
    view.unmount();
  });

  test('popstate honors route interceptor return false', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/blocked')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
        unstable_routeInterceptor: () => false,
      },
      elements,
    );

    window.history.pushState({}, '', '/blocked');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(getRefetchMock()).not.toHaveBeenCalled();
    expect(capture.router?.path).toBe('/start');

    view.unmount();
  });

  test('popstate can rewrite the route via interceptor', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/intercepted')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
        unstable_routeInterceptor: () => ({
          path: '/intercepted',
          query: 'from=interceptor',
          hash: '',
        }),
      },
      elements,
    );

    window.history.pushState({}, '', '/ignored');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/intercepted'),
      expect.any(URLSearchParams),
      expect.anything(),
    );
    expect(capture.router?.path).toBe('/intercepted');
    expect(capture.router?.query).toBe('from=interceptor');

    view.unmount();
  });

  test('reload leaves the url the browser has alone', async () => {
    // the same round trip that popstate must not suffer: a trailing slash and
    // a percent encoded space do not survive parseRoute + getRouteUrl
    window.history.replaceState({}, '', '/start/?q=hello%20world');
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: 'q=hello+world', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [ROUTE_ID]: ['/start', 'q=hello+world'],
        [IS_STATIC_ID]: false,
      },
    );

    await act(async () => {
      await capture.router!.reload();
      await flush();
    });

    expect(window.location.pathname + window.location.search).toBe(
      '/start/?q=hello%20world',
    );
    expect(getRefetchMock()).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('popstate leaves the url the browser restored alone', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );

    try {
      // a trailing slash and a percent-encoded space both survive the round trip
      // through parseRoute, which the address bar must not be rewritten with
      window.history.pushState({}, '', '/start/?q=hello%20world');
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'));
        await flush();
      });

      expect(window.location.pathname + window.location.search).toBe(
        '/start/?q=hello%20world',
      );
      expect(capture.router?.query).toBe('q=hello+world');
      // query-only popstate must not scroll (#1959)
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('a server rewrite drops the requested hash from the committed route', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/z', ''],
      [IS_STATIC_ID]: false,
    }));
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/z')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    try {
      // asked for a hash, but the server answered with a different route
      await act(async () => {
        await capture.router!.push('/y#frag');
        await flush();
      });
      expect(capture.router?.path).toBe('/z');
      expect(window.location.hash).toBe('');
      scrollToSpy.mockClear();

      window.history.pushState({}, '', '/z');
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'));
        await flush();
      });

      // nothing moved, so the requested '#frag' must not still count as committed
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('popstate that lands on another route moves the url with it', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/new', ''],
      [IS_STATIC_ID]: false,
    }));
    installRefetch(refetch);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/new')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );

    // the browser restored /old, but the server redirects it to /new
    window.history.pushState({}, '', '/old');
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();
    });

    expect(capture.router?.path).toBe('/new');
    expect(window.location.pathname).toBe('/new');

    view.unmount();
  });

  test('popstate scrolls to hash target with instant behavior for new path', async () => {
    const elements = {
      [unstable_getRouteSlotId('/start')]: <div>start</div>,
      [unstable_getRouteSlotId('/next')]: <div>next</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const restoreScrollY = stubScrollY(100);
    const hashTarget = document.createElement('div');
    hashTarget.id = 'target';
    const getBoundingClientRectSpy = vi
      .spyOn(hashTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 40 } as DOMRect);
    document.body.append(hashTarget);

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      window.history.pushState({}, '', '/next#target');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 140,
        behavior: 'instant',
      });
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      restoreScrollY();
    }
  });

  test('popstate path change scrolls to top with instant behavior when hash target is missing', async () => {
    const elements = {
      [unstable_getRouteSlotId('/start')]: <div>start</div>,
      [unstable_getRouteSlotId('/next')]: <div>next</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      window.history.pushState({}, '', '/next#missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      view.unmount();
    }
  });

  test('popstate hash-only transition commits hash without refetch', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      window.history.pushState({}, '', '/start#missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(capture.router?.path).toBe('/start');
      expect(capture.router?.hash).toBe('#missing');
      // same-path hash-only back/forward stays on the client
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  test('newer navigation aborts previous in-flight route fetch', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    let firstSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn<typeof fetch>((_input, init = {}) => {
      const signal = init.signal as AbortSignal | undefined;
      if (!firstSignal) {
        firstSignal = signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              reject(
                Object.assign(new Error('Aborted'), { name: 'AbortError' }),
              );
            },
            { once: true },
          );
        });
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchSpy as typeof fetch);
    const refetch = vi.fn(
      async (
        _rscPath: string,
        _rscParams?: unknown,
        options?: { signal?: AbortSignal },
      ) => {
        await fetch(
          'http://localhost/rsc',
          options?.signal ? { signal: options.signal } : {},
        );
        return {};
      },
    );
    installRefetch(refetch as unknown as MockedRefetch);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      foo: true,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      const firstPromise = capture.router.push('/next');
      await Promise.resolve();
      const secondPromise = capture.router.push('/start?x=2');
      await secondPromise;
      await firstPromise;
      await flush();

      expect(refetch).toHaveBeenCalledTimes(2);
      expect(firstSignal?.aborted).toBe(true);
      expect(capture.router.path).toBe('/start');
      expect(capture.router.query).toBe('x=2');
    } finally {
      view.unmount();
      fetchMock.mockRestore();
    }
  });

  test('an instant nav scrolls once, not again when the response lands', async () => {
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              [ROUTE_ID]: ['/next', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        ...instantNavElements(),
        [unstable_getRouteSlotId('/start')]: <Probe />,
      },
    );
    try {
      const pushed = capture.router!.push('/next', {
        unstable_instant: true,
      });
      await act(async () => {
        await flush();
      });
      await act(async () => {
        land!();
        await pushed;
        await flush();
      });

      // the shell commit scrolls; the response landing must not scroll again
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('an instant nav whose response rewrites the route pushes once', async () => {
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              [ROUTE_ID]: ['/streamed', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        ...instantNavElements(),
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [unstable_getRouteSlotId('/streamed')]: <Probe />,
      },
    );
    const historyPushSpy = vi.spyOn(window.history, 'pushState');
    const historyReplaceSpy = vi.spyOn(window.history, 'replaceState');
    try {
      // commits the requested url first, then the response moves the route
      const pushed = capture.router!.push('/next', {
        unstable_instant: true,
      });
      await act(async () => {
        await flush();
      });
      await act(async () => {
        land!();
        await pushed;
        await flush();
      });

      expect(capture.router?.path).toBe('/streamed');
      expect(window.location.pathname).toBe('/streamed');
      // the second reconcile must replace the entry it already pushed
      expect(historyPushSpy).toHaveBeenCalledTimes(1);
      expect(String(historyReplaceSpy.mock.lastCall?.[2])).toContain(
        '/streamed',
      );
    } finally {
      historyReplaceSpy.mockRestore();
      historyPushSpy.mockRestore();
      view.unmount();
    }
  });

  test('changeRoute applies route rewrite from refetch result', async () => {
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/streamed', 'x=1'],
      [IS_STATIC_ID]: false,
    }));
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [unstable_getRouteSlotId('/streamed')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      foo: true,
    };
    const historyPushSpy = vi.spyOn(window.history, 'pushState');

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await capture.router.push('/next?from=push');
    await flush();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(unstable_encodeRoutePath('/next'));
    const refetchParams = refetch.mock.calls[0]?.[1] as URLSearchParams;
    expect(refetchParams.get('query')).toBe('from=push');
    expect(capture.router.path).toBe('/streamed');
    expect(capture.router.query).toBe('x=1');

    const streamedPushes = historyPushSpy.mock.calls.filter((call) => {
      const target = call[2];
      const url =
        target instanceof URL
          ? target
          : new URL(String(target), window.location.origin);
      return url.pathname === '/streamed';
    });
    expect(streamedPushes).toHaveLength(1);

    view.unmount();
  });

  const renderFollowRouter = async ({
    responses,
    slots = [],
    meta = {},
  }: {
    responses: (
      | { reject: { status: number; location?: string } }
      | { redirect: { from: string; fromQuery?: string; location: string } }
      | {
          deferred: ReturnType<typeof createDeferred<Record<string, unknown>>>;
        }
      | { resolve: Record<string, unknown> }
    )[];
    slots?: string[];
    meta?: Record<string, unknown>;
  }) => {
    const refetch = vi.fn<RefetchInner>();
    for (const response of responses) {
      if ('redirect' in response) {
        const err = createCustomError('redirect', {
          status: 307,
          location: response.redirect.location,
        });
        const Thrower = () => {
          throw err;
        };
        refetch.mockResolvedValueOnce({
          [unstable_getRouteSlotId(response.redirect.from)]: <Thrower />,
          [ROUTE_ID]: [
            response.redirect.from,
            response.redirect.fromQuery ?? '',
          ],
          [IS_STATIC_ID]: false,
        });
      } else if ('reject' in response) {
        refetch.mockImplementationOnce(() =>
          Promise.reject(createCustomError('follow-error', response.reject)),
        );
      } else if ('deferred' in response) {
        refetch.mockImplementationOnce(() => response.deferred.promise);
      } else {
        refetch.mockResolvedValueOnce(response.resolve);
      }
    }
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      ...Object.fromEntries(
        slots.map((path) => [
          unstable_getRouteSlotId(path),
          <Probe key={path} />,
        ]),
      ),
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      ...meta,
    };
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }
    return { view, refetch, capture, router: capture.router };
  };

  const renderInterruptedFollow = async (caughtSlot: ReactNode) => {
    const pendingFollow = createDeferred<Record<string, unknown>>();
    const refetch = vi
      .fn<RefetchInner>()
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/a')]: caughtSlot,
        [ROUTE_ID]: ['/a', ''],
        [IS_STATIC_ID]: false,
      })
      .mockImplementation(() => pendingFollow.promise);
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }
    await act(async () => {
      await capture.router!.push('/a').catch(() => {});
      await flushUntil(() => refetch.mock.calls.length === 2);
    });
    return { view, router: capture.router, refetch, pendingFollow };
  };

  test('a rejected fetch redirect hard navigates with a new entry', async () => {
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 307, location: 'https://other.example/next' } },
      ],
    });
    const lengthBefore = window.history.length;
    await act(async () => {
      await router.push('/moved').catch(() => {});
      await flush();
      await flush();
    });
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(replaceLocationSpy).toHaveBeenCalledTimes(1);
    expect(replaceLocationSpy.mock.calls[0]![0]).toContain('/next');
    expect(capture.router!.path).toBe('/start');
    // the requested entry is written first, so leaving it keeps /start behind
    expect(window.location.pathname).toBe('/moved');
    replaceLocationSpy.mockRestore();
    view.unmount();
  });

  test('a rejected redirect to an unusable protocol never reaches the browser', async () => {
    const assignSpy = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => {});
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    refetch.mockImplementationOnce(() =>
      Promise.reject(
        createCustomError('moved', {
          status: 307,
          location: 'javascript:alert(1)',
        }),
      ),
    );
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await expect(capture.router!.push('/moved')).rejects.toThrow(
          'cannot follow a redirect to javascript:alert(1)',
        );
        await flush();
        await flush();
      });

      expect(assignSpy).not.toHaveBeenCalled();
      expect(replaceLocationSpy).not.toHaveBeenCalled();
      expect(view.container.textContent).toContain(
        'cannot follow a redirect to javascript:alert(1)',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      assignSpy.mockRestore();
      replaceLocationSpy.mockRestore();
      view.unmount();
    }
  });

  test('a rejected redirect on replace navigates without a new entry', async () => {
    const assignSpy = vi
      .spyOn(window.location, 'assign')
      .mockImplementation(() => {});
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    const refetch = vi.fn<RefetchInner>();
    refetch.mockImplementationOnce(() =>
      Promise.reject(
        createCustomError('moved', {
          status: 307,
          location: 'https://other.example/login',
        }),
      ),
    );
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      await capture.router!.replace('/account/profile').catch(() => {});
      await flush();
      await flush();
    });

    expect(replaceLocationSpy).toHaveBeenCalledTimes(1);
    expect(replaceLocationSpy.mock.calls[0]![0]).toBe(
      'https://other.example/login',
    );
    expect(assignSpy).not.toHaveBeenCalled();

    assignSpy.mockRestore();
    replaceLocationSpy.mockRestore();
    view.unmount();
  });

  test('an instant 404 keeps the requested url in the address bar', async () => {
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockImplementationOnce(() =>
        Promise.reject(createCustomError('nf', { status: 404 })),
      )
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/404', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const profileSlotId = unstable_getRouteSlotId('/account/profile');
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [profileSlotId]: <div>profile</div>,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
      [`${ETAG_ID_PREFIX}${profileSlotId}`]: IMMUTABLE_ETAG,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    const lengthBefore = window.history.length;
    await act(async () => {
      await capture
        .router!.push('/account/profile', {
          unstable_instant: true,
        })
        .catch(() => {});
      await flush();
      await flush();
    });

    // the 404 route renders while the address bar keeps the requested url
    expect(capture.router.path).toBe('/404');
    expect(window.location.pathname).toBe('/account/profile');
    expect(window.history.length).toBe(lengthBefore + 1);

    view.unmount();
  });

  test('a redirect that keeps the requested pathname still scrolls', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/account/profile?login=1',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/account/profile')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/account/profile', ''],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/account/profile')]: <Probe />,
        [ROUTE_ID]: ['/account/profile', 'login=1'],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      await capture.router!.push('/account/profile').catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });

    // the visible navigation is from /start, so the page scrolls even
    // though the redirect keeps the requested pathname
    expect(capture.router.query).toBe('login=1');
    // twice: the requested commit, then the follow
    expect(scrollToSpy).toHaveBeenCalledTimes(2);

    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a query-only navigation that redirects writes one history entry', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/login',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/products')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/products', 'page=2'],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/login', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const elements = {
      [unstable_getRouteSlotId('/products')]: <Probe />,
      [unstable_getRouteSlotId('/login')]: <Probe />,
      [ROUTE_ID]: ['/products', 'page=1'],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/products', query: 'page=1', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    window.history.replaceState(null, '', '/products?page=1');
    const lengthBefore = window.history.length;
    await act(async () => {
      await capture.router!.push('/products?page=2').catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });

    // the requested entry is written once, then replaced by the redirect
    expect(capture.router.path).toBe('/login');
    expect(window.location.pathname).toBe('/login');
    expect(window.history.length).toBe(lengthBefore + 1);

    view.unmount();
  });

  test('a slow redirect after an instant error writes one requested entry', async () => {
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: 'login',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    let resolveSecond!: (value: Record<string, unknown>) => void;
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/account/profile')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/account/profile', ''],
        [IS_STATIC_ID]: false,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const profileSlotId = unstable_getRouteSlotId('/account/profile');
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [profileSlotId]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/account/login')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [`${ETAG_ID_PREFIX}${profileSlotId}`]: IMMUTABLE_ETAG,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    window.history.replaceState(null, '', '/start');
    const lengthBefore = window.history.length;
    let pushPromise: Promise<void> | undefined;
    await act(async () => {
      pushPromise = capture.router!.push('/account/profile', {
        unstable_instant: true,
      });
      // flush the requested route's commit while the redirect is pending
      await flush();
      await flush();
    });
    await act(async () => {
      resolveSecond({
        [ROUTE_ID]: ['/account/login', ''],
        [IS_STATIC_ID]: false,
      });
      await pushPromise!.catch(() => {});
      await flush();
      await flush();
    });

    expect(window.location.pathname).toBe('/account/login');
    expect(window.history.length).toBe(lengthBefore + 1);

    view.unmount();
  });

  test('a redirect keeps an explicit scroll false option', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, capture, router } = await renderFollowRouter({
      responses: [
        { redirect: { from: '/moved', location: '/next' } },
        { resolve: { [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/next'],
    });
    await act(async () => {
      await router.push('/moved', { scroll: false }).catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });
    expect(capture.router!.path).toBe('/next');
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a query-only redirect keeps an explicit scroll true option', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/products?page=3',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/products')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/products', 'page=2'],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/products')]: <Probe />,
        [ROUTE_ID]: ['/products', 'page=3'],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const elements = {
      [unstable_getRouteSlotId('/products')]: <Probe />,
      [ROUTE_ID]: ['/products', 'page=1'],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/products', query: 'page=1', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    window.history.replaceState(null, '', '/products?page=1');
    await act(async () => {
      await capture
        .router!.push('/products?page=2', { scroll: true })
        .catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });

    expect(capture.router.query).toBe('page=3');
    // twice: the requested commit, then the follow
    expect(scrollToSpy).toHaveBeenCalledTimes(2);

    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a link with scroll false keeps it through a redirect', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/next',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/moved')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/moved', ''],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: (
        <div>
          <Probe />
          <Link to={'/moved' as never} scroll={false}>
            go
          </Link>
        </div>
      ),
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      view.container.querySelector('a')!.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      await flush();
      await flush();
      await flush();
      await flush();
    });

    expect(capture.router.path).toBe('/next');
    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a redirect cycle surfaces a redirect loop error', async () => {
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/a',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>(() =>
      Promise.resolve({
        [unstable_getRouteSlotId('/a')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/a', ''],
        [IS_STATIC_ID]: false,
      }),
    );
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    testHoisted.elements = elements;
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <ErrorBoundary>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </ErrorBoundary>
      </Unstable_SearchCodecsProvider>,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    try {
      await act(async () => {
        await capture.router!.push('/a');
        for (let i = 0; i < 25; i += 1) {
          await flush();
        }
      });
      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );
      expect(refetch).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('an endless redirect chain stops at the hop limit', async () => {
    let calls = 0;
    const refetch = vi.fn<RefetchInner>(() => {
      const path = `/hop/${calls}`;
      calls += 1;
      const err = createCustomError('moved', {
        status: 307,
        location: `/hop/${calls}`,
      });
      const Thrower = () => {
        throw err;
      };
      return Promise.resolve({
        [unstable_getRouteSlotId(path)]: <Thrower />,
        [ROUTE_ID]: [path, ''],
        [IS_STATIC_ID]: false,
      });
    });
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <ErrorBoundary>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </ErrorBoundary>
      </Unstable_SearchCodecsProvider>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/hop/0');
        for (let i = 0; i < 120; i += 1) {
          await flush();
        }
      });
      expect(view.container.textContent).toContain(
        'too many redirect or 404 follows',
      );
      // a follow never resets the budget, so committing each hop still caps
      expect(refetch).toHaveBeenCalledTimes(21);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  }, 20_000);

  test('a committing redirect cycle stops at the hop limit', async () => {
    const refetch = vi.fn<RefetchInner>(((rscPath: string) => {
      const path = rscPath === unstable_encodeRoutePath('/a') ? '/a' : '/b';
      const next = path === '/a' ? '/b' : '/a';
      const err = createCustomError('moved', { status: 307, location: next });
      const Thrower = () => {
        throw err;
      };
      return Promise.resolve({
        [unstable_getRouteSlotId(path)]: <Thrower />,
        [ROUTE_ID]: [path, ''],
        [IS_STATIC_ID]: false,
      });
    }) as never);
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <ErrorBoundary>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </ErrorBoundary>
      </Unstable_SearchCodecsProvider>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/a');
        for (let i = 0; i < 120; i += 1) {
          await flush();
        }
      });
      expect(view.container.textContent).toContain(
        'too many redirect or 404 follows',
      );
      // a follow never resets the budget, so committing each hop still caps
      expect(refetch).toHaveBeenCalledTimes(21);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  }, 20_000);

  test('a redirect cycle that throws after each commit stops at the hop limit', async () => {
    const refetch = vi.fn<RefetchInner>(((rscPath: string) => {
      const path = rscPath === unstable_encodeRoutePath('/a') ? '/a' : '/b';
      const next = path === '/a' ? '/b' : '/a';
      const error = createCustomError('moved', {
        status: 307,
        location: next,
      });
      const DelayedRedirect = () => {
        const [shouldThrow, setShouldThrow] = useState(false);
        useEffect(() => setShouldThrow(true), []);
        if (shouldThrow) {
          throw error;
        }
        return <p>{path}</p>;
      };
      return Promise.resolve({
        [unstable_getRouteSlotId(path)]: <DelayedRedirect />,
        [ROUTE_ID]: [path, ''],
        [IS_STATIC_ID]: false,
      });
    }) as never);
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      root: (
        <>
          <Probe />
          <Children />
        </>
      ),
      [unstable_getRouteSlotId('/start')]: <p>start</p>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/a');
        for (let i = 0; i < 160; i += 1) {
          await flush();
        }
      });

      expect(view.container.textContent).toContain(
        'too many redirect or 404 follows',
      );
      expect(refetch).toHaveBeenCalledTimes(21);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  }, 20_000);

  test('a fetch redirect cycle stops at the hop limit', async () => {
    const refetch = vi.fn<RefetchInner>();
    for (let index = 0; index < 40; index += 1) {
      refetch.mockRejectedValueOnce(
        createCustomError('follow-error', {
          status: 307,
          location: index % 2 === 0 ? '/b' : '/a',
        }),
      );
    }
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/a')]: <Probe />,
      [unstable_getRouteSlotId('/b')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await expect(capture.router!.push('/a')).rejects.toThrow(
          'too many redirect or 404 follows',
        );
        await flush();
      });
      expect(refetch).toHaveBeenCalledTimes(21);
      expect(view.container.textContent).toContain(
        'too many redirect or 404 follows',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('an instant redirect scrolls when the visible navigation changed paths', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/account/profile?login=1',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const profileSlotId = unstable_getRouteSlotId('/account/profile');
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [profileSlotId]: <ThrowRedirect />,
        [ROUTE_ID]: ['/account/profile', ''],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [profileSlotId]: <Probe />,
        [ROUTE_ID]: ['/account/profile', 'login=1'],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [profileSlotId]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [`${ETAG_ID_PREFIX}${profileSlotId}`]: IMMUTABLE_ETAG,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      await capture
        .router!.push('/account/profile', {
          unstable_instant: true,
        })
        .catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });

    // the visible navigation is /start -> /account/profile?login=1, so
    // the redirect scrolls even though it only changed the query
    expect(capture.router.query).toBe('login=1');
    // twice: the requested commit, then the follow
    expect(scrollToSpy).toHaveBeenCalledTimes(2);

    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a redirect back to the current route scrolls like the requested navigation', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, refetch, router } = await renderFollowRouter({
      responses: [
        { redirect: { from: '/a', location: '/start' } },
        { resolve: { [ROUTE_ID]: ['/start', ''], [IS_STATIC_ID]: false } },
      ],
    });
    await act(async () => {
      await router.push('/a').catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });
    expect(view.container.textContent).toContain('/start|');
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(scrollToSpy).toHaveBeenCalledTimes(2);
    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a navigation during a redirect follow aborts the chain', async () => {
    const RedirectErrorObject = createCustomError('moved', {
      status: 307,
      location: '/slow',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    let resolveSecond!: (value: Record<string, unknown>) => void;
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/a')]: <ThrowRedirect />,
        [ROUTE_ID]: ['/a', ''],
        [IS_STATIC_ID]: false,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      )
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/other', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/slow')]: <Probe />,
      [unstable_getRouteSlotId('/other')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    let firstPush: Promise<void> | undefined;
    await act(async () => {
      firstPush = capture.router!.push('/a');
      firstPush.catch(() => {});
      await flush();
      await flush();
    });
    // the follow to /slow is in flight; a second navigation supersedes it
    await act(async () => {
      await capture.router!.push('/other').catch(() => {});
      await flush();
      await flush();
    });
    await act(async () => {
      resolveSecond({
        [ROUTE_ID]: ['/slow', ''],
        [IS_STATIC_ID]: false,
      });
      await flush();
      await flush();
    });

    expect(capture.router.path).toBe('/other');

    view.unmount();
  });

  test('a hash change lets the caught route render again', async () => {
    const redirect = createCustomError('redirect', {
      status: 307,
      location: '/next',
    });
    const ThrowUntilHash = () => {
      const router = useRouter() as unknown as RouterApi;
      if (!router.hash) {
        throw redirect;
      }
      return <div>ready</div>;
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { view, router, pendingFollow } = await renderInterruptedFollow(
      <ThrowUntilHash />,
    );

    try {
      await act(async () => {
        await router.push('/a#ready').catch(() => {});
        pendingFollow.resolve({
          [ROUTE_ID]: ['/a', ''],
          [IS_STATIC_ID]: false,
        });
        await flushUntil(() =>
          (view.container.textContent ?? '').includes('ready'),
        );
      });

      expect(view.container.textContent).toContain('ready');
      expect(view.container.textContent).not.toContain('navigation loop');
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('an interrupted redirect follow reports a navigation loop', async () => {
    const redirect = createCustomError('redirect', {
      status: 307,
      location: '/next',
    });
    const ThrowRedirect = () => {
      throw redirect;
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { view, router, refetch, pendingFollow } =
      await renderInterruptedFollow(<ThrowRedirect />);

    try {
      await act(async () => {
        await router.push('/a').catch(() => {});
        pendingFollow.resolve({
          [ROUTE_ID]: ['/a', ''],
          [IS_STATIC_ID]: false,
        });
        await flushUntil(() =>
          (view.container.textContent ?? '').includes(
            'detected a navigation loop',
          ),
        );
      });

      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );
      expect(refetch).toHaveBeenCalledTimes(2);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a 404 error on navigation goes to the 404 route inline', async () => {
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 404 } },
        { resolve: { [ROUTE_ID]: ['/404', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/404'],
      meta: { [HAS404_ID]: true },
    });
    window.history.replaceState(null, '', '/start');
    const lengthBefore = window.history.length;
    await act(async () => {
      await router.push('/missing').catch(() => {});
      await flush();
      await flush();
    });
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(capture.router!.path).toBe('/404');
    // the address bar keeps the requested url as one new entry
    expect(window.location.pathname).toBe('/missing');
    expect(window.history.length).toBe(lengthBefore + 1);
    view.unmount();
  });

  test('push resolves after the 404 follow lands', async () => {
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 404 } },
        { resolve: { [ROUTE_ID]: ['/404', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/404'],
      meta: { [HAS404_ID]: true },
    });
    let callsWhenSettled = 0;
    const record = () => {
      callsWhenSettled = refetch.mock.calls.length;
    };
    await act(async () => {
      await router.push('/missing').then(record);
      await flush();
      await flush();
    });
    expect(callsWhenSettled).toBe(2);
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(capture.router!.path).toBe('/404');
    view.unmount();
  });

  test('a 404 follow fetches the 404 route with the requested query', async () => {
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 404 } },
        { resolve: { [ROUTE_ID]: ['/404', 'foo=bar'], [IS_STATIC_ID]: false } },
      ],
      slots: ['/404'],
      meta: { [HAS404_ID]: true },
    });
    await act(async () => {
      await router.push('/missing?foo=bar').catch(() => {});
      await flush();
      await flush();
    });
    expect(refetch.mock.calls[1]?.[0]).toBe(unstable_encodeRoutePath('/404'));
    // the server renders the 404 page for the query it was asked for
    const params = refetch.mock.calls[1]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('foo=bar');
    expect(capture.router!.query).toBe('foo=bar');
    view.unmount();
  });

  test('a chained redirect that only adds a hash is still followed', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const toNext = createCustomError('redirect', {
      status: 307,
      location: '/next',
    });
    const toHash = createCustomError('redirect', {
      status: 307,
      location: '/next#section',
    });
    const ThrowToNext = () => {
      throw toNext;
    };
    const ThrowToHash = () => {
      throw toHash;
    };
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/next')]: <ThrowToHash />,
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      })
      .mockResolvedValueOnce({
        [unstable_getRouteSlotId('/next')]: <Probe />,
        [ROUTE_ID]: ['/next', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <ThrowToNext />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    await flushUntil(() =>
      (view.container.textContent ?? '').includes('/next|'),
    );

    // the second target differs from the first only by its hash
    expect(view.container.textContent).toContain('/next|');
    expect(window.location.hash).toBe('#section');

    view.unmount();
  });

  test('a hash on the 404 route does not cost a second identical fetch', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>((() =>
      Promise.reject(
        createCustomError('nf', { status: 404 }),
      )) as unknown as RefetchInner);
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/404#frag' as never).catch(() => {});
        for (let i = 0; i < 20; i += 1) {
          await flush();
        }
      });

      // the hash never reaches the server, so the retry would be identical
      expect(refetch).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a fetch redirect that only adds a hash reuses the current route', async () => {
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [{ reject: { status: 307, location: '/start#section' } }],
    });
    await act(async () => {
      await router.reload();
      await flush();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(capture.router).toMatchObject({
      path: '/start',
      hash: '#section',
    });
    view.unmount();
  });

  test('a fetch redirect back to the current route keeps path-change scrolling', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 307, location: '/start#missing' } },
        { resolve: { [ROUTE_ID]: ['/start', ''], [IS_STATIC_ID]: false } },
      ],
    });
    try {
      await act(async () => {
        await router.push('/next');
        await flush();
      });
      expect(refetch).toHaveBeenCalledTimes(2);
      expect(capture.router).toMatchObject({
        path: '/start',
        hash: '#missing',
      });
      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('a query-only fetch redirect to another path resets scroll', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 307, location: '/detail#missing' } },
        { resolve: { [ROUTE_ID]: ['/detail', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/detail'],
    });
    try {
      await act(async () => {
        await router.push('/start?page=2', { scroll: true });
        await flush();
      });
      expect(refetch).toHaveBeenCalledTimes(2);
      expect(capture.router).toMatchObject({
        path: '/detail',
        hash: '#missing',
      });
      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('a server redirect back to the caught query is a loop', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const toPage2 = createCustomError('redirect', {
      status: 307,
      location: '/products?page=2',
    });
    const ThrowToPage2 = () => {
      throw toPage2;
    };
    const refetch = vi.fn<RefetchInner>((() =>
      Promise.resolve({
        [unstable_getRouteSlotId('/products')]: <ThrowToPage2 />,
        // the response sends us back to the query we came from
        [ROUTE_ID]: ['/products', 'page=1'],
        [IS_STATIC_ID]: false,
      })) as unknown as RefetchInner);
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/products')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/products?page=1' as never).catch(() => {});
        await flushUntil(() =>
          (view.container.textContent ?? '').includes(
            'detected a navigation loop',
          ),
        );
      });

      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );
      expect(refetch.mock.calls.length).toBeLessThan(5);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a follow that lands on 404 lets the boundary render again', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const toGone = createCustomError('redirect', {
      status: 307,
      location: '/gone',
    });
    const ThrowToGone = () => {
      throw toGone;
    };
    const refetch = vi.fn<RefetchInner>(((rscPath: string) =>
      rscPath === unstable_encodeRoutePath('/404')
        ? Promise.resolve({
            [unstable_getRouteSlotId('/404')]: <Probe />,
            [ROUTE_ID]: ['/404', ''],
            [IS_STATIC_ID]: false,
          })
        : Promise.reject(
            createCustomError('nf', { status: 404 }),
          )) as unknown as RefetchInner);
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/404')]: <ThrowToGone />,
      [ROUTE_ID]: ['/404', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };
    const view = await renderApp(
      <ErrorBoundary>
        <Router initialRoute={{ path: '/404', query: '', hash: '' }} />
      </ErrorBoundary>,
    );
    await flushUntil(() =>
      (view.container.textContent ?? '').includes('/404|'),
    );

    expect(view.container.textContent).toContain('/404|');
    view.unmount();
  });

  test('a 404 route that itself 404s stops instead of hitting the hop limit', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(() =>
      Promise.reject(createCustomError('nf', { status: 404 })),
    );
    installRefetch(refetch);

    testHoisted.elements = {
      root: (
        <>
          <Probe />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      [unstable_getRouteSlotId('/start')]: <p>start</p>,
      [unstable_getRouteSlotId('/404')]: <p>404</p>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await expect(capture.router!.push('/missing')).rejects.toThrow(
          'detected a navigation loop',
        );
        for (let i = 0; i < 8; i += 1) {
          await flush();
        }
      });

      // one request for /missing, one for /404, then it gives up
      expect(refetch).toHaveBeenCalledTimes(2);
      expect(capture.router?.path).toBe('/404');
      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a retry after a failed navigation fetches again', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('boom'));
    installRefetch(refetch);

    // an error boundary in the root layout, the documented pattern: the
    // router keeps rendering after a navigation fails
    testHoisted.elements = {
      root: (
        <ErrorBoundary>
          <Children />
        </ErrorBoundary>
      ),
      [unstable_getRouteSlotId('/list')]: <Probe />,
      [ROUTE_ID]: ['/list', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <Router initialRoute={{ path: '/list', query: '', hash: '' }} />
      </Unstable_SearchCodecsProvider>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/detail?id=5').catch(() => {});
        await flush();
      });
      refetch.mockClear();

      // the failed navigation must not make /list?id=5 look already loaded
      await act(async () => {
        await capture.router!.push('/list?id=5').catch(() => {});
        await flush();
      });

      expect(refetch).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a retry from a still mounted nav after a failure fetches again', async () => {
    const capture = { router: null as RouterApi | null };
    const navCapture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const NavProbe = makeProbe(navCapture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('boom'));
    installRefetch(refetch);

    testHoisted.elements = {
      root: (
        <>
          <NavProbe />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      [unstable_getRouteSlotId('/list')]: <Probe />,
      [ROUTE_ID]: ['/list', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <Router initialRoute={{ path: '/list', query: '', hash: '' }} />
      </Unstable_SearchCodecsProvider>,
    );
    try {
      await act(async () => {
        await navCapture.router!.push('/detail?id=5').catch(() => {});
        await flush();
      });
      refetch.mockClear();

      await act(async () => {
        await navCapture.router!.push('/list?id=5').catch(() => {});
        await flush();
      });

      expect(refetch).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('an instant retry already at its url replaces the entry a failure wrote', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>();
    refetch.mockRejectedValueOnce(createCustomError('nf', { status: 404 }));
    refetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              [ROUTE_ID]: ['/other', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const nextSlotId = unstable_getRouteSlotId('/next');
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [nextSlotId]: <div>next</div>,
        [unstable_getRouteSlotId('/other')]: <div>other</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
        [`${ETAG_ID_PREFIX}${nextSlotId}`]: IMMUTABLE_ETAG,
        [HAS404_ID]: false,
      },
    );
    try {
      // the failure writes /next itself, and with no 404 route to follow to
      // the router stays mounted, so the retry starts already at its url
      await act(async () => {
        await expect(capture.router!.push('/next')).rejects.toBeTruthy();
        await flush();
      });
      expect(window.location.pathname).toBe('/next');
      pushSpy.mockClear();
      replaceSpy.mockClear();

      const retried = capture.router!.push('/next', {
        unstable_instant: true,
        scroll: false,
      });
      await act(async () => {
        await flush();
      });
      await act(async () => {
        land!();
        await retried;
        await flush();
      });
      expect(window.location.pathname).toBe('/other');
      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
      pushSpy.mockRestore();
      replaceSpy.mockRestore();
      view.unmount();
    }
  });

  test('an instant nav does not chase a hash target that arrives later', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const nextSlotId = unstable_getRouteSlotId('/next');
    let land: (() => void) | undefined;
    const refetch = vi.fn<RefetchInner>(
      () =>
        new Promise((resolve) => {
          land = () =>
            resolve({
              extra: <div id="target">target</div>,
              [ROUTE_ID]: ['/next', ''],
              [IS_STATIC_ID]: false,
            });
        }),
    );
    installRefetch(refetch);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const restoreScrollY = stubScrollY(100);
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return { top: this.id === 'target' ? 40 : 0 } as DOMRect;
      });
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <Probe />,
        // the cached shell paints without #target; it streams in after
        [nextSlotId]: (
          <>
            <Probe />
            <Slot id="extra" />
          </>
        ),
        extra: <div>placeholder</div>,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
        [`${ETAG_ID_PREFIX}${nextSlotId}`]: IMMUTABLE_ETAG,
      },
    );
    try {
      document.body.append(view.container);
      const pushed = capture.router!.push('/next#target', {
        unstable_instant: true,
      });
      await act(async () => {
        await flush();
      });
      // the path changed and the target was missing, so it went to the top
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });

      await act(async () => {
        land!();
        await pushed;
        await flush();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(document.getElementById('target')).not.toBeNull();
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
    } finally {
      view.container.remove();
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      scrollToSpy.mockRestore();
      restoreScrollY();
    }
  });

  test('an unrelated element merge does not scroll or push again', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);
    const MergeButton = () => {
      const mergeElements = useMergeElements();
      return (
        <button
          data-testid="merge-sidebar"
          onClick={() => void mergeElements(fetchRsc('sidebar'))}
        />
      );
    };
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: (
          <>
            <Probe />
            <MergeButton />
          </>
        ),
        [unstable_getRouteSlotId('/b')]: (
          <>
            <Probe />
            <MergeButton />
          </>
        ),
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    try {
      await act(async () => {
        await capture.router!.push('/b');
        await flush();
      });
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledTimes(1);
      // this merge suspends the root, so React replays the layout effect for
      // a state it has already applied
      refetch.mockResolvedValueOnce({ 'sidebar:/': <div>fresh</div> });
      await act(async () => {
        view.container
          .querySelector<HTMLButtonElement>('[data-testid="merge-sidebar"]')
          ?.click();
        await flush();
      });
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledTimes(1);
    } finally {
      scrollToSpy.mockRestore();
      pushSpy.mockRestore();
      view.unmount();
    }
  });

  test('a second 404 with a query lands on the 404 route again', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(((rscPath: string) =>
      rscPath === unstable_encodeRoutePath('/404')
        ? Promise.resolve({
            [unstable_getRouteSlotId('/404')]: <Probe />,
            [ROUTE_ID]: ['/404', ''],
            [IS_STATIC_ID]: false,
          })
        : Promise.reject(
            createCustomError('nf', { status: 404 }),
          )) as unknown as RefetchInner);
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await capture.router!.push('/missing').catch(() => {});
        for (let i = 0; i < 4; i += 1) {
          await flush();
        }
      });
      expect(view.container.textContent).toContain('/404|');

      // now on /404, a second miss whose url carries a query
      await act(async () => {
        await capture.router!.push('/missing2?x=1').catch(() => {});
        for (let i = 0; i < 4; i += 1) {
          await flush();
        }
      });

      expect(view.container.textContent).not.toContain('redirect loop');
      expect(view.container.textContent).toContain('/404|');
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a 404 follow scrolls to the top like the navigation it replaces', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, capture, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 404 } },
        { resolve: { [ROUTE_ID]: ['/404', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/404'],
      meta: { [HAS404_ID]: true },
    });
    scrollToSpy.mockClear();

    await act(async () => {
      await router.push('/missing').catch(() => {});
      await flush();
      await flush();
    });

    expect(capture.router!.path).toBe('/404');
    // the user asked for a new path, so the 404 page starts at the top, and
    // the failed commit on the way there does not scroll of its own
    expect(scrollToSpy).toHaveBeenCalledTimes(1);

    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a follow into a known static route does not fetch it', async () => {
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockResolvedValueOnce({ [ROUTE_ID]: ['/a', ''], [IS_STATIC_ID]: false })
      .mockImplementationOnce(() =>
        Promise.reject(createCustomError('follow-error', { status: 404 })),
      );
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    // starting on a static /404 records it as static, so the follow below can
    // serve it without a request
    const view = await renderRouter(
      { initialRoute: { path: '/404', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/404')]: <Probe />,
        [unstable_getRouteSlotId('/a')]: <Probe />,
        [ROUTE_ID]: ['/404', ''],
        [IS_STATIC_ID]: true,
        [HAS404_ID]: true,
      },
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    await act(async () => {
      await capture.router!.push('/a');
      await flush();
    });
    await act(async () => {
      await capture.router!.push('/missing').catch(() => {});
      for (let i = 0; i < 4; i += 1) {
        await flush();
      }
    });

    // /a and the failed /missing; the follow serves the static /404
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(capture.router.path).toBe('/404');
    expect(window.location.pathname).toBe('/missing');

    view.unmount();
  });

  test('a query-only redirect to a known static path resets scroll', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const redirect = createCustomError('redirect', {
      status: 307,
      location: '/detail#missing',
    });
    const refetch = vi
      .fn<RefetchInner>()
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/start', 'page=1'],
        [IS_STATIC_ID]: false,
      })
      .mockRejectedValueOnce(redirect);
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const view = await renderRouter(
      { initialRoute: { path: '/detail', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/detail')]: <Probe />,
        [unstable_getRouteSlotId('/start')]: <Probe />,
        [ROUTE_ID]: ['/detail', ''],
        [IS_STATIC_ID]: true,
      },
    );
    try {
      await act(async () => {
        await capture.router!.push('/start?page=1');
        await flush();
      });
      scrollToSpy.mockClear();

      await act(async () => {
        await capture.router!.push('/start?page=2', { scroll: true });
        await flush();
      });

      expect(refetch).toHaveBeenCalledTimes(2);
      expect(capture.router).toMatchObject({
        path: '/detail',
        hash: '#missing',
      });
      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'instant',
      });
    } finally {
      scrollToSpy.mockRestore();
      view.unmount();
    }
  });

  test('a redirect that lands on a missing route goes to the 404 route', async () => {
    const { view, refetch, capture, router } = await renderFollowRouter({
      responses: [
        { redirect: { from: '/moved', location: '/gone' } },
        { reject: { status: 404 } },
        { resolve: { [ROUTE_ID]: ['/404', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/404'],
      meta: { [HAS404_ID]: true },
    });
    await act(async () => {
      await router.push('/moved').catch(() => {});
      for (let i = 0; i < 8; i += 1) {
        await flush();
      }
    });
    expect(refetch).toHaveBeenCalledTimes(3);
    expect(capture.router!.path).toBe('/404');
    view.unmount();
  });

  test('a query-only navigation that redirects to another pathname keeps its scroll', async () => {
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => {});
    const { view, capture, router } = await renderFollowRouter({
      responses: [
        {
          redirect: { from: '/start', fromQuery: 'page=2', location: '/login' },
        },
        { resolve: { [ROUTE_ID]: ['/login', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/login'],
    });
    window.history.replaceState(null, '', '/start?page=1');
    await act(async () => {
      await router.push('/start?page=2').catch(() => {});
      await flush();
      await flush();
      await flush();
      await flush();
    });
    // the requested query update does not scroll, and the redirect
    // inherits that decision
    expect(capture.router!.path).toBe('/login');
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
    view.unmount();
  });

  test('a 404 navigation without a 404 route renders Not Found', async () => {
    const { view, refetch, router } = await renderFollowRouter({
      responses: [{ reject: { status: 404 } }],
      meta: { [HAS404_ID]: false },
    });
    await act(async () => {
      await expect(router.push('/missing')).rejects.toThrow('follow-error');
      await flush();
      await flush();
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/missing');
    expect(view.container.textContent).toContain('Not Found');
    view.unmount();
  });

  test('a navigation after the built-in Not Found page recovers', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>();
    refetch
      .mockRejectedValueOnce(createCustomError('nf', { status: 404 }))
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/other', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/other')]: <div>other page</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
      </ErrorBoundary>,
    );
    try {
      await act(async () => {
        await expect(capture.router!.push('/missing')).rejects.toBeTruthy();
        await flush();
      });
      expect(view.container.textContent).toContain('Not Found');

      await act(async () => {
        await capture.router!.push('/other');
        await flush();
      });
      expect(view.container.textContent).toContain('other page');
      expect(view.container.textContent).not.toContain('Not Found');
      expect(window.location.pathname).toBe('/other');
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('custom 404 handling without a /404 page keeps Not Found fallback', async () => {
    const ThrowNotFoundErrorObject = createCustomError('not-found', {
      status: 404,
    });
    const ThrowNotFound = () => {
      throw ThrowNotFoundErrorObject;
    };

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    expect(view.container.textContent).toContain('Not Found');
    expect(getRefetchMock()).not.toHaveBeenCalled();

    view.unmount();
  });

  test('two routers recover from the same revived 404 error', async () => {
    const captureA = { router: null as RouterApi | null };
    const ProbeA = makeProbe(captureA);
    const sharedError = createCustomError('not-found', { status: 404 });
    const ThrowShared = () => {
      throw sharedError;
    };

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowShared />,
      [unstable_getRouteSlotId('/404')]: (
        <div>
          <ProbeA />
          <span>found-page</span>
        </div>
      ),
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };

    const initialRoute = { path: '/start', query: '', hash: '' };
    const view = await renderApp(
      <StrictMode>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={initialRoute} />
          <Router initialRoute={initialRoute} />
        </Unstable_SearchCodecsProvider>
      </StrictMode>,
    );
    await flush();
    await flush();

    // each boundary follows independently and both recover
    expect(captureA.router?.path).toBe('/404');
    expect(
      (view.container.textContent?.match(/found-page/g) ?? []).length,
    ).toBe(2);
    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/404'),
      expect.anything(),
      expect.anything(),
    );
    // one per router, doubled by the strict mode replay we accept
    expect(getRefetchMock()).toHaveBeenCalledTimes(4);

    view.unmount();
  });

  test('custom 404 handling with a /404 page triggers client navigation to /404', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFoundErrorObject = createCustomError('not-found', {
      status: 404,
    });
    const ThrowNotFound = () => {
      throw ThrowNotFoundErrorObject;
    };

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    await flush();

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/404'),
      expect.any(URLSearchParams),
      expect.anything(),
    );
    expect(capture.router?.path).toBe('/404');

    view.unmount();
  });

  test('custom 404 handling with a /404 page recovers under strict mode', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFoundErrorObject = createCustomError('not-found', {
      status: 404,
    });
    const ThrowNotFound = () => {
      throw ThrowNotFoundErrorObject;
    };
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };

    const view = await renderRouterInStrictMode(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    await flush();
    try {
      // doubled by the strict mode replay we accept, and no more than that
      expect(getRefetchMock()).toHaveBeenCalledTimes(2);
      expect(getRefetchMock()).toHaveBeenCalledWith(
        unstable_encodeRoutePath('/404'),
        expect.any(URLSearchParams),
        expect.anything(),
      );
      expect(capture.router?.path).toBe('/404');

      const errorLogs = consoleLogSpy.mock.calls.filter(
        ([message]) => message === 'Error while navigating to 404:',
      );
      expect(errorLogs).toHaveLength(0);
    } finally {
      view.unmount();
      consoleLogSpy.mockRestore();
    }
  });

  test('redirect error triggers same-origin client navigation', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      location: '/target?ok=1',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/target')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    // the follow fetches and its elements suspend, so let them settle
    await flush();
    await flush();

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/target'),
      expect.any(URLSearchParams),
      expect.anything(),
    );
    expect(capture.router?.path).toBe('/target');
    expect(capture.router?.query).toBe('ok=1');
    expect(replaceStateSpy).toHaveBeenCalled();

    view.unmount();
  });

  test('a follow whose fetch is redirected hard navigates', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/login',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});

    getRefetchMock().mockImplementation(((rscPath: string) =>
      rscPath === unstable_encodeRoutePath('/login')
        ? Promise.reject(
            createCustomError('redirect', {
              status: 307,
              location: 'https://other.example/dashboard',
            }),
          )
        : Promise.resolve({})) as never);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/dashboard')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      await flush();
      await flush();
      await flush();

      // the follow dispatch is not a push, so the browser replaces
      expect(replaceLocationSpy).toHaveBeenCalledTimes(1);
      expect(replaceLocationSpy.mock.calls[0]![0]).toContain('/dashboard');
    } finally {
      view.unmount();
      replaceLocationSpy.mockRestore();
    }
  });

  test('a followed redirect keeps the base path in the url', async () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      window.history.replaceState({}, '', '/docs/start');
      const capture = { router: null as RouterApi | null };
      const Probe = makeProbe(capture);
      const ThrowRedirectErrorObject = createCustomError('redirect', {
        status: 307,
        location: '/login', // an app path; the base path is the client's job
      });
      const ThrowRedirect = () => {
        throw ThrowRedirectErrorObject;
      };

      const elements = {
        [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
        [unstable_getRouteSlotId('/login')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      };

      const view = await renderRouter(
        {
          initialRoute: { path: '/start', query: '', hash: '' },
        },
        elements,
      );
      await flush();
      await flush();

      expect(capture.router?.path).toBe('/login');
      expect(window.location.pathname).toBe('/docs/login');

      view.unmount();
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a followed redirect whose response redirects again replaces instead of pushing', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/login',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    getRefetchMock().mockImplementation(((rscPath: string) =>
      Promise.resolve(
        rscPath === unstable_encodeRoutePath('/login')
          ? { [ROUTE_ID]: ['/dashboard', ''] }
          : {},
      )) as never);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/dashboard')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    await flush();
    await flush();

    expect(capture.router?.path).toBe('/dashboard');
    expect(window.location.pathname).toBe('/dashboard');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();

    view.unmount();
  });

  test('a self redirect surfaces a redirect loop error instead of a blank page', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/start',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    try {
      const view = await renderApp(
        <ErrorBoundary>
          <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
            <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
          </Unstable_SearchCodecsProvider>
        </ErrorBoundary>,
      );
      await flush();
      await flush();

      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );

      view.unmount();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('one router follows the same revived error twice', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    // a module scoped error, or one revived from the cached elements, is the
    // same object every time it is thrown
    const RedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/login',
    });
    const ThrowRedirect = () => {
      throw RedirectErrorObject;
    };
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    installRefetch(refetch);

    const view = await renderRouter(
      { initialRoute: { path: '/start', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
        [unstable_getRouteSlotId('/login')]: <Probe />,
        [ROUTE_ID]: ['/start', ''],
        [IS_STATIC_ID]: false,
      },
    );
    await flush();
    await flush();
    expect(view.container.textContent).toContain('/login');

    // back to the route that throws it, with the very same error object
    refetch.mockResolvedValueOnce({
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    });
    await act(async () => {
      await capture.router!.push('/start').catch(() => {});
      for (let i = 0; i < 4; i += 1) {
        await flush();
      }
    });

    // the followed route renders again instead of a blank slot
    expect(view.container.textContent).toContain('/login');

    view.unmount();
  });

  test('a protocol relative redirect is not treated as an app path', async () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      window.history.replaceState({}, '', '/docs/start');
      const capture = { router: null as RouterApi | null };
      const Probe = makeProbe(capture);
      // same origin, so the router follows it rather than leaving the app
      const ThrowRedirectErrorObject = createCustomError('redirect', {
        status: 307,
        location: `//${window.location.host}/docs/login`,
      });
      const ThrowRedirect = () => {
        throw ThrowRedirectErrorObject;
      };

      const view = await renderRouter(
        { initialRoute: { path: '/start', query: '', hash: '' } },
        {
          [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
          [unstable_getRouteSlotId('/login')]: <Probe />,
          [ROUTE_ID]: ['/start', ''],
          [IS_STATIC_ID]: false,
        },
      );
      await flush();
      await flush();

      expect(capture.router?.path).toBe('/login');
      expect(window.location.pathname).toBe('/docs/login');

      view.unmount();
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a redirect the client cannot follow surfaces instead of blanking', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: 'mailto:someone@example.com',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      await flush();
      await flush();

      expect(view.container.textContent).toContain(
        'cannot follow a redirect to mailto:someone@example.com',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('a session of followed redirects does not exhaust the budget', async () => {
    // the follow budget bounds one navigation, so a long session of ordinary
    // redirects must not run it down
    const refetch = vi.fn<RefetchInner>(((rscPath: string) => {
      if (rscPath !== unstable_encodeRoutePath('/moved')) {
        return Promise.resolve({});
      }
      const err = createCustomError('moved', {
        status: 307,
        location: '/next',
      });
      const Thrower = () => {
        throw err;
      };
      return Promise.resolve({
        [unstable_getRouteSlotId('/moved')]: <Thrower />,
        [ROUTE_ID]: ['/moved', ''],
        [IS_STATIC_ID]: false,
      });
    }) as unknown as RefetchInner);
    installRefetch(refetch);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
        <ErrorBoundary>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </ErrorBoundary>
      </Unstable_SearchCodecsProvider>,
    );
    try {
      for (let i = 0; i < 110; i += 1) {
        await act(async () => {
          await capture.router!.push('/moved').catch(() => {});
          await flush();
          await flush();
        });
        await act(async () => {
          await capture.router!.push('/start').catch(() => {});
          await flush();
        });
      }

      expect(view.container.textContent).not.toContain('too many redirect');
      expect(capture.router!.path).toBe('/start');
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  }, 60_000);

  test('a redirect that only adds a hash is followed, not a loop', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/start#section',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    getRefetchMock().mockImplementation(((rscPath: string) =>
      Promise.resolve(
        rscPath === unstable_encodeRoutePath('/start')
          ? {
              [unstable_getRouteSlotId('/start')]: <p>Start Section</p>,
              [ROUTE_ID]: ['/start', ''],
            }
          : {},
      )) as never);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    try {
      const view = await renderApp(
        <ErrorBoundary>
          <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
            <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
          </Unstable_SearchCodecsProvider>
        </ErrorBoundary>,
      );
      await flush();
      await flush();

      expect(view.container.textContent).not.toContain(
        'detected a navigation loop',
      );
      expect(view.container.textContent).toContain('Start Section');
      expect(window.location.hash).toBe('#section');

      view.unmount();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('a fetched redirect back to the caught route surfaces a redirect loop error', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      status: 307,
      location: '/login',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    getRefetchMock().mockImplementation(((rscPath: string) =>
      Promise.resolve(
        rscPath === unstable_encodeRoutePath('/login')
          ? { [ROUTE_ID]: ['/start', ''] }
          : {},
      )) as never);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    try {
      const view = await renderApp(
        <ErrorBoundary>
          <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
            <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
          </Unstable_SearchCodecsProvider>
        </ErrorBoundary>,
      );
      await flush();
      await flush();

      expect(view.container.textContent).toContain(
        'detected a navigation loop',
      );

      view.unmount();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('redirect error with cross-origin location uses window.location.replace', async () => {
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      location: 'https://example.com/target?ok=1',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      await flush();

      expect(replaceLocationSpy).toHaveBeenCalledWith(
        'https://example.com/target?ok=1',
      );
      expect(window.location.pathname).toBe('/start');
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      replaceLocationSpy.mockRestore();
    }
  });

  test('a non-fetching navigation does not abort the completed fetch', async () => {
    const { view, router, refetch, capture } = await renderFollowRouter({
      responses: [
        { resolve: { [ROUTE_ID]: ['/next', ''], [IS_STATIC_ID]: false } },
      ],
      slots: ['/next'],
    });
    await act(async () => {
      await router.push('/next');
      await flush();
    });
    const { signal } = refetch.mock.calls[0]![2]!;
    expect(capture.router?.path).toBe('/next');
    // a same route push takes the no refetch shortcut
    await act(async () => {
      await router.push('/next');
      await flush();
    });
    expect(signal!.aborted).toBe(false);
    view.unmount();
  });

  test('a non-fetching navigation aborts an active fetch', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    const { view, router, refetch } = await renderFollowRouter({
      responses: [{ deferred: pending }],
    });
    const pushes: Promise<void>[] = [];

    await act(async () => {
      pushes.push(router.push('/slow'));
      await Promise.resolve();
    });
    const { signal } = refetch.mock.calls[0]![2]!;
    await act(async () => {
      await router.push('/start');
    });

    expect(signal?.aborted).toBe(true);

    pending.resolve({ [ROUTE_ID]: ['/slow', ''], [IS_STATIC_ID]: false });
    await pushes[0];
    view.unmount();
  });

  test('a late superseded response cannot release the active fetch', async () => {
    const first = createDeferred<Record<string, unknown>>();
    const second = createDeferred<Record<string, unknown>>();
    const third = createDeferred<Record<string, unknown>>();
    const { view, router, refetch } = await renderFollowRouter({
      responses: [
        { deferred: first },
        { deferred: second },
        { deferred: third },
      ],
      slots: ['/first', '/second', '/third'],
    });
    const pushes: Promise<void>[] = [];
    const startPush = async (path: string) => {
      await act(async () => {
        pushes.push(router.push(path));
        await Promise.resolve();
      });
    };

    await startPush('/first');
    const firstSignal = refetch.mock.calls[0]![2]!.signal!;
    await startPush('/second');
    const secondSignal = refetch.mock.calls[1]![2]!.signal!;
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      first.resolve({ [ROUTE_ID]: ['/first', ''], [IS_STATIC_ID]: false });
      await pushes[0];
      await flush();
    });
    await startPush('/third');

    expect(secondSignal.aborted).toBe(true);
    expect(refetch.mock.calls[2]![2]!.signal?.aborted).toBe(false);

    await act(async () => {
      second.resolve({ [ROUTE_ID]: ['/second', ''], [IS_STATIC_ID]: false });
      third.resolve({ [ROUTE_ID]: ['/third', ''], [IS_STATIC_ID]: false });
      await Promise.all(pushes);
      await flush();
    });
    view.unmount();
  });

  test('a cross origin rejected redirect hard navigates on push', async () => {
    const { view, router } = await renderFollowRouter({
      responses: [
        { reject: { status: 307, location: 'http://elsewhere.test/login' } },
      ],
      slots: [],
    });
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    window.history.replaceState(null, '', '/dashboard');
    const lengthBefore = window.history.length;
    await act(async () => {
      await router.push('/protected').catch(() => {});
      await flush();
      await flush();
    });
    // the requested entry is written, then the browser leaves from it
    expect(window.location.pathname).toBe('/protected');
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(replaceLocationSpy).toHaveBeenCalledWith(
      'http://elsewhere.test/login',
    );
    replaceLocationSpy.mockRestore();
    view.unmount();
  });

  test('a network error stays an error instead of leaving the app', async () => {
    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<RefetchInner>(async () => ({}));
    // the shape checkStatus gives a network failure
    refetch.mockRejectedValueOnce(
      createCustomError('Failed to fetch', { unstable_networkError: true }),
    );
    installRefetch(refetch);

    testHoisted.elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <ErrorBoundary>
        <Unstable_SearchCodecsProvider searchCodecs={[postsSearchCodec]}>
          <Router initialRoute={{ path: '/start', query: '', hash: '' }} />
        </Unstable_SearchCodecsProvider>
      </ErrorBoundary>,
    );
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }
      await act(async () => {
        await expect(capture.router!.push('/protected')).rejects.toThrow(
          'Failed to fetch',
        );
        await flush();
      });
      expect(replaceLocationSpy).not.toHaveBeenCalled();
      expect(view.container.textContent).toContain(
        'Caught an unexpected error',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      replaceLocationSpy.mockRestore();
      view.unmount();
    }
  });

  test('redirect error with a different origin leaves the app', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirectErrorObject = createCustomError('redirect', {
      location: 'http://localhost:4321/target?ok=1',
    });
    const ThrowRedirect = () => {
      throw ThrowRedirectErrorObject;
    };

    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/target')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      await flush();

      expect(replaceLocationSpy).toHaveBeenCalledWith(
        'http://localhost:4321/target?ok=1',
      );
      expect(getRefetchMock()).not.toHaveBeenCalledWith(
        unstable_encodeRoutePath('/target'),
        expect.any(URLSearchParams),
        expect.anything(),
      );
    } finally {
      view.unmount();
      replaceLocationSpy.mockRestore();
    }
  });

  test('useNavigationStatus pending stays until the new route client async resolves', async () => {
    // The next route's data resolves immediately, but a client component in it
    // suspends with no data fetch. Pending must persist until that resolves,
    // proving it tracks the navigation transition, not just data loading.
    const clientDelay = createDeferred<void>();
    const ClientSuspends = () => {
      use(clientDelay.promise);
      return <h1>Page 2</h1>;
    };
    const PendingProbe = () => {
      const { pending } = useNavigationStatus();
      return pending ? (
        <div data-testid="pending">Pending</div>
      ) : (
        <div data-testid="not-pending">Idle</div>
      );
    };
    const refetch = vi.fn<RefetchInner>(async () => ({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
    }));
    installRefetch(refetch);
    window.history.replaceState({}, '', '/one');

    const view = await renderRouter(
      { initialRoute: { path: '/one', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Link to="/two">
              Go to two
              <PendingProbe />
            </Link>
          </>
        ),
        [unstable_getRouteSlotId('/two')]: <ClientSuspends />,
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      const has = (testid: string) =>
        view.container.querySelector(`[data-testid="${testid}"]`) !== null;

      expect(has('not-pending')).toBe(true);
      expect(has('pending')).toBe(false);

      const link = Array.from(view.container.querySelectorAll('a')).find(
        (anchor) => anchor.textContent?.includes('Go to two'),
      ) as HTMLAnchorElement | undefined;
      if (!link) {
        throw new Error('expected link');
      }
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      // Data is ready, but the client component is still suspended.
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(has('pending')).toBe(true);
      expect(has('not-pending')).toBe(false);
      expect(view.container.textContent).not.toContain('Page 2');

      // Resolve the client-only async; the transition settles and commits the
      // new page (the old page, with its Link and indicators, unmounts).
      await act(async () => {
        clientDelay.resolve();
        await flush();
      });

      expect(has('pending')).toBe(false);
      expect(view.container.textContent).toContain('Page 2');
    } finally {
      view.unmount();
    }
  });

  test('a suspended static destination is fetched again when superseded', async () => {
    const clientDelay = createDeferred<void>();
    const secondNavigation = createDeferred<Record<string, unknown>>();
    const ClientSuspends = () => {
      use(clientDelay.promise);
      return <h1>Page 2</h1>;
    };
    const refetch = vi
      .fn<RefetchInner>()
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: true,
      })
      .mockReturnValueOnce(secondNavigation.promise);
    installRefetch(refetch);
    window.history.replaceState({}, '', '/one');
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const view = await renderRouter(
      { initialRoute: { path: '/one', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Probe />
          </>
        ),
        [unstable_getRouteSlotId('/two')]: <ClientSuspends />,
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }
      await act(async () => {
        await capture.router!.push('/two');
        await flush();
      });
      expect(view.container.textContent).toContain('Page 1');

      let secondPush!: Promise<void>;
      await act(async () => {
        secondPush = capture.router!.push('/two');
        await Promise.resolve();
      });
      expect(refetch).toHaveBeenCalledTimes(2);

      await act(async () => {
        clientDelay.resolve();
        await flush();
      });
      expect(view.container.textContent).toContain('Page 1');
      expect(window.location.pathname).toBe('/one');

      await act(async () => {
        secondNavigation.resolve({
          [ROUTE_ID]: ['/two', ''],
          [IS_STATIC_ID]: true,
        });
        await secondPush;
        await flush();
      });
      expect(view.container.textContent).toContain('Page 2');
      expect(window.location.pathname).toBe('/two');
    } finally {
      view.unmount();
    }
  });

  test('a delayed failure commit cannot replace a newer navigation', async () => {
    const customCommits: Array<() => void> = [];
    const customTransition = vi.fn((fn: () => void) => {
      customCommits.push(fn);
    });
    const refetch = vi
      .fn<RefetchInner>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/other', ''],
        [IS_STATIC_ID]: false,
      });
    installRefetch(refetch);
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    testHoisted.elements = {
      root: (
        <>
          <Probe />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      [unstable_getRouteSlotId('/start')]: (
        <Link to="/broken" unstable_startTransition={customTransition}>
          broken
        </Link>
      ),
      [unstable_getRouteSlotId('/other')]: <div>other page</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = await renderApp(
      <Router initialRoute={{ path: '/start', query: '', hash: '' }} />,
    );
    try {
      await act(async () => {
        view.container.querySelector('a')?.click();
        await flush();
      });
      expect(customTransition).toHaveBeenCalledTimes(1);

      await act(async () => {
        await capture.router!.push('/other');
        await flush();
      });
      await act(async () => {
        customCommits[0]?.();
        await flush();
      });

      expect(view.container.textContent).toContain('other page');
      expect(view.container.textContent).not.toContain(
        'Caught an unexpected error',
      );
    } finally {
      consoleErrorSpy.mockRestore();
      view.unmount();
    }
  });

  test('useNavigationStatus stays idle when the Link uses unstable_startTransition', async () => {
    // A custom unstable_startTransition replaces React's useTransition, so
    // isPending never flips and the hook reports { pending: false } for that
    // link even mid-navigation. This locks the documented limitation.
    const navigation = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<RefetchInner>(() => navigation.promise);
    installRefetch(refetch);
    window.history.replaceState({}, '', '/one');
    let inCustomTransition = false;
    let mergeInsideTransition: boolean | undefined;
    const customCommits: Array<() => void> = [];
    const customTransition = vi.fn((fn: () => void) => {
      customCommits.push(() => {
        inCustomTransition = true;
        try {
          fn();
        } finally {
          inCustomTransition = false;
        }
      });
    });

    const PendingProbe = () => {
      const { pending } = useNavigationStatus();
      return pending ? (
        <div data-testid="pending">Pending</div>
      ) : (
        <div data-testid="not-pending">Idle</div>
      );
    };

    const view = await renderRouter(
      { initialRoute: { path: '/one', query: '', hash: '' } },
      {
        [unstable_getRouteSlotId('/one')]: (
          <>
            <h1>Page 1</h1>
            <Link
              to="/two"
              unstable_instant
              unstable_startTransition={customTransition}
            >
              Go to two
              <PendingProbe />
            </Link>
          </>
        ),
        [ROUTE_ID]: ['/one', ''],
        [IS_STATIC_ID]: false,
      },
    );

    try {
      testHoisted.onMerge = () => {
        mergeInsideTransition = inCustomTransition;
      };
      const has = (testid: string) =>
        view.container.querySelector(`[data-testid="${testid}"]`) !== null;

      expect(has('not-pending')).toBe(true);

      const link = Array.from(view.container.querySelectorAll('a')).find(
        (anchor) => anchor.textContent?.includes('Go to two'),
      ) as HTMLAnchorElement | undefined;
      if (!link) {
        throw new Error('expected link');
      }
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      });
      await flush();

      // Navigation is in flight (refetch not resolved), but the custom
      // transition bypassed useTransition, so pending never flipped.
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(has('pending')).toBe(false);
      expect(has('not-pending')).toBe(true);
      expect(view.container.textContent).toContain('Page 1');
      expect(customTransition).not.toHaveBeenCalled();

      await act(async () => {
        navigation.resolve({
          [unstable_getRouteSlotId('/two')]: <h1>Page 2</h1>,
          [ROUTE_ID]: ['/two', ''],
          [IS_STATIC_ID]: true,
        });
        await flush();
      });

      expect(customTransition).toHaveBeenCalledTimes(1);
      expect(view.container.textContent).toContain('Page 1');
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        await flush();
      });

      // The first response is static, but its delayed commit has not run. A
      // newer navigation must fetch it again instead of trusting missing data.
      expect(refetch).toHaveBeenCalledTimes(2);
      expect(customTransition).toHaveBeenCalledTimes(2);
      await act(async () => {
        customCommits[0]?.();
        await flush();
      });
      expect(view.container.textContent).toContain('Page 1');
      await act(async () => {
        customCommits[1]?.();
        await flush();
      });

      expect(view.container.textContent).toContain('Page 2');
      expect(mergeInsideTransition).toBe(true);
    } finally {
      view.unmount();
    }
  });
});

describe('INTERNAL_ServerRouter', () => {
  test('provides route and blocks client navigation APIs', async () => {
    const capture = { router: null as RouterApi | null };
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const Probe = () => {
      const router = useRouter() as unknown as RouterApi;
      setRouter(router);
      return <div>{router.path}</div>;
    };

    const elementsPromise = resolvedThenable({
      root: <Children />,
      [unstable_getRouteSlotId('/server')]: <Probe />,
    });

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        <INTERNAL_ServerRouter
          route={{ path: '/server', query: '', hash: '' }}
        />
      </INTERNAL_ServerRoot>,
    );

    expect(view.container.textContent).toContain('/server');
    expect(capture.router?.path).toBe('/server');
    await expect(capture.router!.push('/next')).rejects.toThrow(
      'changeRoute is not in the server',
    );
    expect(() => capture.router!.prefetch('/next')).toThrow(
      'prefetchRoute is not in the server',
    );

    view.unmount();
  });
});
