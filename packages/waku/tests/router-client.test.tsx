// @vitest-environment happy-dom

import { StrictMode, act, use, useState } from 'react';
import type { ReactElement } from 'react';
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
  Children,
  INTERNAL_ServerRoot,
  Root,
  unstable_prefetchRsc as prefetchRsc,
  useRefetch,
} from '../src/minimal/client.js';
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

// Elements the mocked `Root` provides for the current render. Hoisted so the
// `vi.mock` factory can read it.
const testHoisted = vi.hoisted(() => ({
  elements: {} as Record<string, unknown>,
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

const createRefetchMock = () =>
  vi.fn<ReturnType<typeof useRefetch>>(async () => ({}));

const getRefetchMock = () => {
  const results = vi.mocked(useRefetch).mock.results;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.type === 'return') {
      return result.value as ReturnType<typeof createRefetchMock>;
    }
  }
  throw new Error('useRefetch was not called');
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

vi.mock('../src/minimal/client.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/minimal/client.js')
  >('../src/minimal/client.js');

  return {
    ...actual,
    Root: vi.fn((props: Parameters<typeof actual.Root>[0]) =>
      actual.INTERNAL_ServerRoot({
        elementsPromise: resolvedThenable({
          root: <Children />,
          ...testHoisted.elements,
        }),
        children: props.children,
      }),
    ),
    unstable_prefetchRsc: vi.fn(),
    useRefetch: vi.fn(),
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

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve));
  });
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

  vi.mocked(useRefetch).mockReset();
  vi.mocked(useRefetch).mockReturnValue(createRefetchMock());
  vi.mocked(preloadModule).mockClear();
  vi.mocked(prefetchRsc).mockReset();
  // prefetchRsc returns the decoded Promise<Elements>; default to an empty
  // shell so prefetchRoute's cache wiring has a promise to track.
  vi.mocked(prefetchRsc).mockReturnValue(resolvedThenable({}));
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

  test('returns deterministic route/slice slot ids', () => {
    expect(unstable_getRouteSlotId('/foo')).toBe('route:/foo');
    expect(unstable_getSliceSlotId('slice-1')).toBe('slice:slice-1');
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
    const routeChangeEvents = { on: vi.fn(), off: vi.fn() };

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
          routeChangeEvents,
          fetchingSlices: new Set(),
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
        mode: 'push',
        url: expect.any(URL),
      }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      2,
      { path: '/start', query: 'query=2', hash: '' },
      expect.objectContaining({
        shouldScroll: false,
        mode: 'replace',
        url: expect.any(URL),
      }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      3,
      { path: '/start', query: '', hash: '' },
      { shouldScroll: true, refetch: true },
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
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/prefetch',
      query: 'x=1',
      hash: '#h',
    });
    expect(capture.router.unstable_events).toBe(routeChangeEvents);

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
            routeChangeEvents: { on: vi.fn(), off: vi.fn() },
            fetchingSlices: new Set(),
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
      expect.objectContaining({ mode: 'push', url: expect.any(URL) }),
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      2,
      expectedRoute,
      expect.objectContaining({ mode: 'replace', url: expect.any(URL) }),
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
              routeChangeEvents: { on: vi.fn(), off: vi.fn() },
              fetchingSlices: new Set(),
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

      expect(prefetchRoute).toHaveBeenNthCalledWith(1, {
        path: '/static',
        query: '',
        hash: '',
      });
      expect(prefetchRoute).toHaveBeenNthCalledWith(2, {
        path: '/posts/a',
        query: '',
        hash: '',
      });

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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
            routeChangeEvents: { on: vi.fn(), off: vi.fn() },
            fetchingSlices: new Set(),
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/next',
      query: '',
      hash: '',
    });
    expect(changeRoute).toHaveBeenCalledTimes(1);
    expect(changeRoute).toHaveBeenCalledWith(
      { path: '/next', query: '', hash: '' },
      expect.objectContaining({
        shouldScroll: true,
        mode: 'push',
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Reflect.deleteProperty(window, 'scrollY');
      }
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
    expect(prefetchRoute).toHaveBeenCalledTimes(5);
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Link
          to="/next"
          unstable_prefetchOnEnter
          unstable_prefetchOnView
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
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/next',
      query: '',
      hash: '',
    });
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

  test('Link uses unstable_startTransition override for navigation', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const unstableStartTransition = vi.fn((fn: () => void) => fn());

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Link to="/next" unstable_startTransition={unstableStartTransition}>
          next
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await flush();

    expect(unstableStartTransition).toHaveBeenCalledTimes(1);
    expect(changeRoute).toHaveBeenCalledWith(
      { path: '/next', query: '', hash: '' },
      expect.objectContaining({
        startTransition: unstableStartTransition,
      }),
    );

    view.unmount();
  });

  test('Link ref supports object refs and callback cleanup', async () => {
    const contextValue = {
      route: { path: '/start', query: '', hash: '' },
      changeRoute: vi.fn(async () => {}),
      prefetchRoute: vi.fn(),
      routeChangeEvents: { on: vi.fn(), off: vi.fn() },
      fetchingSlices: new Set<string>(),
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
});

describe('Slice', () => {
  test('throws without RouterContext', async () => {
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Slice id="slice-1" />
      </RouterContext>,
      elements,
    );

    expect(view.container.textContent).toContain('slice-content');
    view.unmount();
  });

  test('lazy slice fetches once, dedupes, and clears in-flight set on completion', async () => {
    const fetchingSlices = new Set<string>();

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices,
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
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

  test('logs refetch failures and clears fetching set', async () => {
    const fetchingSlices = new Set<string>();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('slice failed'));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices,
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

  test('push performs refetch for dynamic routes and emits start/complete events', async () => {
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

    const events: string[] = [];
    capture.router.unstable_events.on('start', () => events.push('start'));
    capture.router.unstable_events.on('complete', () =>
      events.push('complete'),
    );

    await act(async () => {
      await capture.router!.push('/next?x=1#h');
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(unstable_encodeRoutePath('/next'));
    const params = refetch.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(events).toEqual(['start', 'complete']);
    expect(capture.router.path).toBe('/next');
    expect(capture.router.query).toBe('x=1');
    expect(capture.router.hash).toBe('#h');

    view.unmount();
  });

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
      .fn<ReturnType<typeof useRefetch>>()
      .mockImplementationOnce(() => firstNavigation.promise)
      .mockImplementationOnce(() => secondNavigation.promise)
      .mockImplementationOnce(() => thirdNavigation.promise);
    vi.mocked(useRefetch).mockReturnValue(refetch);
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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

  test('push writes history when refetch fails', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({}));
    refetch.mockRejectedValueOnce(new Error('refetch failed'));
    vi.mocked(useRefetch).mockReturnValue(refetch);
    const historyPushSpy = vi.spyOn(window.history, 'pushState');

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
      if (!capture.router) {
        throw new Error('router not initialized');
      }

      await expect(capture.router.push('/next')).rejects.toThrow(
        'refetch failed',
      );
      expect(historyPushSpy).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe('/next');
      expect(capture.router.path).toBe('/start');
    } finally {
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
    expect(vi.mocked(prefetchRsc).mock.calls[0]?.[0]).toBe(
      unstable_encodeRoutePath('/next'),
    );
    const params = vi.mocked(prefetchRsc).mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(prefetchHook).toHaveBeenCalledWith('/next', expect.any(Function));
    expect(preloadModule).toHaveBeenCalledWith('/assets//next.js', {
      as: 'script',
    });

    view.unmount();
  });

  // The instant shell: a RESOLVED prefetch for the target is passed to refetch
  // as `unstable_prefetched`, so the merge Proxy paints the static shell from
  // it while dynamic holes stream from the fresh fetch.
  const instantNavElements = () => ({
    [unstable_getRouteSlotId('/start')]: <div>start</div>,
    [unstable_getRouteSlotId('/next')]: <div>next</div>,
    [ROUTE_ID]: ['/start', ''],
    [IS_STATIC_ID]: false,
    // mark /next's route slot static so the instant branch engages
    [`${ETAG_ID_PREFIX}${unstable_getRouteSlotId('/next')}`]: IMMUTABLE_ETAG,
  });

  test('instant nav reuses a resolved prefetch as the shell base', async () => {
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    };
    vi.mocked(prefetchRsc).mockReturnValue(resolvedThenable(shell));

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

    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.objectContaining({
        unstable_prefetched: { elements: shell, complete: true },
      }),
    );

    view.unmount();
  });

  test('instant nav does not reuse an in-flight prefetch', async () => {
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    // Never resolves: the prefetch stays in-flight, so it is not reused (an
    // instant nav must not wait) and refetch fetches fresh instead.
    const pending = createDeferred<Record<string, unknown>>();
    vi.mocked(prefetchRsc).mockReturnValue(pending.promise);

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
      await capture.router!.push('/next', { unstable_instant: true });
    });

    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.not.objectContaining({ unstable_prefetched: expect.anything() }),
    );

    view.unmount();
  });

  test('instant nav does not reuse a prefetch for a different query', async () => {
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    const shell = {
      [unstable_getRouteSlotId('/next')]: <div>next-shell</div>,
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    };
    vi.mocked(prefetchRsc).mockReturnValue(resolvedThenable(shell));

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

    // The q=a shell must not be served for the q=b navigation.
    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.not.objectContaining({ unstable_prefetched: expect.anything() }),
    );

    view.unmount();
  });

  test('non-instant nav does not reuse an in-flight prefetch', async () => {
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    // Never resolves: the prefetch stays in-flight (no abort signal), so it
    // must not become the navigation's data source.
    const pending = createDeferred<Record<string, unknown>>();
    vi.mocked(prefetchRsc).mockReturnValue(pending.promise);

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
      await capture.router!.push('/next');
    });

    expect(refetch).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.not.objectContaining({ unstable_prefetched: expect.anything() }),
    );

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

  test('popstate query-only transition preserves scroll behavior', async () => {
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
      window.history.pushState({}, '', '/start?a=2');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(capture.router?.path).toBe('/start');
      expect(capture.router?.query).toBe('a=2');
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
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
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
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
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
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

  test('popstate hash-only transition preserves scroll when hash target is missing', async () => {
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
      window.history.pushState({}, '', '/start#missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(capture.router?.path).toBe('/start');
      expect(capture.router?.hash).toBe('#missing');
      expect(scrollToSpy).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });

  // NOTE: etags carry/replay moved into the minimal layer; it is now
  // covered by tests/minimal-etags.test.tsx. The router only triggers the
  // refetch on navigation, which this test pins.
  test('changeRoute refetches on navigation to a dynamic route', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({}));
    vi.mocked(useRefetch).mockReturnValue(refetch);

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
    try {
      if (!capture.router) {
        throw new Error('router not initialized');
      }
      await act(async () => {
        await capture.router!.push('/next');
      });
      expect(refetch).toHaveBeenCalled();
      expect(capture.router.path).toBe('/next');
      expect(capture.router.query).toBe('');
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
    vi.mocked(useRefetch).mockReturnValue(
      refetch as ReturnType<typeof useRefetch>,
    );

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

  test('changeRoute applies route rewrite from refetch result', async () => {
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/streamed', 'x=1'],
      [IS_STATIC_ID]: false,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);

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

  test('custom 404 handling without a /404 page keeps Not Found fallback', async () => {
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
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

  test('custom 404 handling with a /404 page triggers client navigation to /404', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
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

  test('custom 404 handling with a /404 page avoids strict-mode refetching race', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
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
      expect(getRefetchMock()).toHaveBeenCalledTimes(1);
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
    const ThrowRedirect = () => {
      throw createCustomError('redirect', { location: '/target?ok=1' });
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

  test('redirect error with cross-origin location uses window.location.replace', async () => {
    const ThrowRedirect = () => {
      throw createCustomError('redirect', {
        location: 'https://example.com/target?ok=1',
      });
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

  test('redirect error with same hostname but different origin stays in client navigation', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirect = () => {
      throw createCustomError('redirect', {
        location: 'http://localhost:4321/target?ok=1',
      });
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

      expect(replaceLocationSpy).not.toHaveBeenCalled();
      expect(capture.router?.path).toBe('/target');
      expect(capture.router?.query).toBe('ok=1');
      expect(getRefetchMock()).toHaveBeenCalledWith(
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
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(async () => ({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
    }));
    vi.mocked(useRefetch).mockReturnValue(refetch);
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

  test('useNavigationStatus stays idle when the Link uses unstable_startTransition', async () => {
    // A custom unstable_startTransition replaces React's useTransition, so
    // isPending never flips and the hook reports { pending: false } for that
    // link even mid-navigation. This locks the documented limitation.
    const navigation = createDeferred<Record<string, unknown>>();
    const refetch = vi.fn<ReturnType<typeof useRefetch>>(
      () => navigation.promise,
    );
    vi.mocked(useRefetch).mockReturnValue(refetch);
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
            <Link
              to="/two"
              unstable_startTransition={(fn) => {
                void fn();
              }}
            >
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

      // Navigation is in flight (refetch not resolved), but the custom
      // transition bypassed useTransition, so pending never flipped.
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(has('pending')).toBe(false);
      expect(has('not-pending')).toBe(true);
      expect(view.container.textContent).toContain('Page 1');

      await act(async () => {
        navigation.resolve({
          [ROUTE_ID]: ['/two', ''],
          [IS_STATIC_ID]: false,
        });
        await flush();
      });

      expect(view.container.textContent).toContain('Page 2');
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
    const onResult = capture.router!.unstable_events.on(
      'start',
      () => {},
    ) as unknown as (() => never) | undefined;
    expect(typeof onResult).toBe('function');
    expect(() => onResult?.()).toThrow('routeChange:on is not in the server');
    const offResult = capture.router!.unstable_events.off(
      'start',
      () => {},
    ) as unknown as (() => never) | undefined;
    expect(typeof offResult).toBe('function');
    expect(() => offResult?.()).toThrow('routeChange:off is not in the server');

    view.unmount();
  });
});
