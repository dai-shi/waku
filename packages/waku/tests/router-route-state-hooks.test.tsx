/** @vitest-environment happy-dom */

import { act } from 'react';
import type { ReactElement } from 'react';
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
import * as minimalClient from '../src/minimal/client.js';
import { INTERNAL_ServerRoot } from '../src/minimal/client.js';
import * as caches from '../src/router/client-core-utils/caches.js';
import { clearCaches } from '../src/router/client-core-utils/caches.js';
import { useHmrRefetch } from '../src/router/client-core-utils/hmr.js';
import {
  useInitialRoute,
  useInitialRscParams,
} from '../src/router/client-core-utils/initial-route.js';
import * as slice from '../src/router/client-core-utils/slice.js';
import {
  clearRegisteredLazySlices,
  forEachRegisteredLazySlice,
  registerLazySlice,
} from '../src/router/client-core-utils/slice.js';
import {
  ROUTE_ID,
  encodeRoutePath,
} from '../src/router/isomorphic-utils/route-path.js';

const resolvedThenable = <T,>(value: T): Promise<T> =>
  Object.assign(Promise.resolve(value), {
    status: 'fulfilled' as const,
    value,
  });

const renderApp = async (element: ReactElement) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
});

describe('useInitialRoute', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('uses element meta when the ROUTE_ID path differs from the proposed route', async () => {
    window.history.replaceState({}, '', '/start#kept');
    const capture: { route?: unknown; firstHash?: string } = {};
    const Probe = () => {
      const route = useInitialRoute({
        path: '/start',
        query: 'a=1',
        hash: '#kept',
      });
      capture.firstHash ??= route.hash;
      capture.route = route;
      return null;
    };

    const view = await renderApp(
      <INTERNAL_ServerRoot
        elementsPromise={resolvedThenable({
          [ROUTE_ID]: ['/about', 'q=2'],
        })}
      >
        <Probe />
      </INTERNAL_ServerRoot>,
    );

    expect(capture.firstHash).toBe('');
    expect(capture.route).toEqual({
      path: '/about',
      query: 'q=2',
      hash: '#kept',
    });
    view.unmount();
  });

  test('uses the proposed route when ROUTE_ID is absent', async () => {
    window.history.replaceState({}, '', '/start');
    const proposed = { path: '/start', query: 'a=1', hash: '#h' };
    const capture: { route?: unknown; firstHash?: string } = {};
    const Probe = () => {
      const route = useInitialRoute(proposed);
      capture.firstHash ??= route.hash;
      capture.route = route;
      return null;
    };

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={resolvedThenable({})}>
        <Probe />
      </INTERNAL_ServerRoot>,
    );

    expect(capture.firstHash).toBe('');
    expect(capture.route).toEqual({
      path: '/start',
      query: 'a=1',
      hash: '#h',
    });
    view.unmount();
  });

  test('restores the address-bar hash after mount', async () => {
    window.history.replaceState({}, '', '/start#from-bar');
    const capture: { route?: { hash: string } } = {};
    const Probe = () => {
      capture.route = useInitialRoute({
        path: '/start',
        query: '',
        hash: '#from-fallback',
      });
      return null;
    };

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={resolvedThenable({})}>
        <Probe />
      </INTERNAL_ServerRoot>,
    );

    expect(capture.route?.hash).toBe('#from-bar');
    view.unmount();
  });
});

describe('useHmrRefetch', () => {
  const stubHot = () => {
    Object.defineProperty(import.meta, 'hot', {
      configurable: true,
      value: {},
    });
  };

  beforeEach(() => {
    clearCaches();
    clearRegisteredLazySlices();
    stubHot();
  });

  afterEach(() => {
    Reflect.deleteProperty(import.meta, 'hot');
    vi.restoreAllMocks();
    clearCaches();
    clearRegisteredLazySlices();
    (
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
    ).__WAKU_RSC_RELOAD_LISTENERS__ = [];
  });

  test('cache clearing preserves lazy-slice registrations', () => {
    registerLazySlice('slice-a');
    clearCaches();
    const ids: string[] = [];
    forEachRegisteredLazySlice((id) => ids.push(id));
    expect(ids).toEqual(['slice-a']);
  });

  test('clears caches then refetches the settled route and lazy slices', async () => {
    const order: string[] = [];
    const onBeforeRefetch = vi.fn(() => {
      order.push('before');
    });
    vi.spyOn(caches, 'clearCaches').mockImplementation(() => {
      order.push('clear');
    });
    vi.spyOn(minimalClient, 'unstable_fetchRsc').mockImplementation(
      async () => {
        order.push('refetch');
        return {};
      },
    );
    const fetchSlice = vi.spyOn(slice, 'fetchSlice').mockImplementation(() => {
      order.push('slice');
    });
    registerLazySlice('slice-a');
    registerLazySlice('slice-b');

    const register = vi
      .spyOn(minimalClient, 'useRegisterRscReloadListener_UNSTABLE')
      .mockImplementation(
        () => minimalClient.unstable_registerRscReloadListener,
      );
    const Probe = () => {
      useHmrRefetch({
        getSettledRoute: () => ({ path: '/hot', query: 'q=1', hash: '' }),
        onBeforeRefetch,
      });
      return null;
    };

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={resolvedThenable({})}>
        <Probe />
      </INTERNAL_ServerRoot>,
    );

    expect(register).toHaveBeenCalled();
    const reload = (
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
    ).__WAKU_RSC_RELOAD_LISTENERS__?.at(-1);
    expect(reload).toBeTypeOf('function');
    await act(async () => {
      reload!();
    });

    expect(order.slice(0, 2)).toEqual(['before', 'clear']);
    expect(order).toContain('refetch');
    expect(order).toContain('slice');
    expect(order.indexOf('clear')).toBeLessThan(order.indexOf('refetch'));
    const refetchCall = vi
      .mocked(minimalClient.unstable_fetchRsc)
      .mock.calls.find(([rscPath]) => rscPath === encodeRoutePath('/hot'));
    expect(refetchCall).toBeDefined();
    expect(refetchCall?.[1]).toBeInstanceOf(URLSearchParams);
    expect((refetchCall?.[1] as URLSearchParams).get('query')).toBe('q=1');
    expect(fetchSlice).toHaveBeenCalledWith(
      'slice-a',
      expect.any(Function),
      true,
    );
    expect(fetchSlice).toHaveBeenCalledWith(
      'slice-b',
      expect.any(Function),
      true,
    );

    view.unmount();
  });

  test('does not register under INTERNAL_ServerRoot, which has no Root store', async () => {
    const Probe = () => {
      useHmrRefetch({
        getSettledRoute: () => ({ path: '/hot', query: '', hash: '' }),
      });
      return null;
    };

    (
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
    ).__WAKU_RSC_RELOAD_LISTENERS__ = [];

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={resolvedThenable({})}>
        <Probe />
      </INTERNAL_ServerRoot>,
    );

    expect(
      (globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] })
        .__WAKU_RSC_RELOAD_LISTENERS__,
    ).toEqual([]);
    view.unmount();
  });
});

describe('useInitialRscParams', () => {
  test('reuses params for the same key until the creating mount commits', async () => {
    const captured: URLSearchParams[] = [];
    const Probe = ({ path, query }: { path: string; query: string }) => {
      captured.push(useInitialRscParams(path, query));
      return null;
    };

    const view = await renderApp(
      <>
        <Probe path="/a" query="q=1" />
        <Probe path="/a" query="q=1" />
        <Probe path="/b" query="q=1" />
      </>,
    );

    expect(captured).toHaveLength(3);
    expect(captured[0]).toBe(captured[1]);
    expect(captured[2]).not.toBe(captured[0]);
    expect(captured[0]!.get('query')).toBe('q=1');
    const first = captured[0];
    view.unmount();

    captured.length = 0;
    const next = await renderApp(<Probe path="/a" query="q=1" />);
    expect(captured[0]).not.toBe(first);
    next.unmount();
  });
});
