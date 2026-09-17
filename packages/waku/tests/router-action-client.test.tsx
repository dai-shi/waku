// @vitest-environment happy-dom

import {
  StrictMode,
  Suspense,
  act,
  startTransition,
  use,
  useEffect,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_HEADER, ETAGS_ID } from '../src/lib/utils/etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import { fetchRscInputTransformers } from '../src/minimal/client-utils/input-transformers.js';
import {
  Children_UNSTABLE as Children,
  unstable_callServerRsc as callServerRsc,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from '../src/minimal/client.js';
import { Link, Router, useRouter } from '../src/router/client.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

const decode = vi.hoisted(() => vi.fn());
vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: async (response: Promise<Response>) => {
      const elements = decode();
      await response;
      return elements;
    },
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const roots: ReturnType<typeof createRoot>[] = [];
const pending: (() => void)[] = [];

const deferred = <T,>(fallback: T) => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  pending.push(() => resolve(fallback));
  return { promise, resolve };
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.stubGlobal('fetch', async () => new Response('{}'));
  decode.mockReset();
  window.history.replaceState({}, '', '/start');
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  await act(async () => pending.splice(0).forEach((resolve) => resolve()));
  document.body.replaceChildren();
  clearInitialRscEntries();
  fetchRscInputTransformers.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const mount = async () => {
  let api!: {
    register: ReturnType<typeof useRegisterRscEnhancer>;
    router: ReturnType<typeof useRouter>;
  };
  const Probe = () => {
    const register = useRegisterRscEnhancer();
    const router = useRouter();
    useEffect(() => {
      api = { register, router };
    });
    return <Children />;
  };
  decode.mockReturnValue({
    root: <Probe />,
    [getRouteSlotId('/start')]: 'start',
    [ROUTE_ID]: ['/start', window.location.search.slice(1)],
    [IS_STATIC_ID]: false,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const errors = vi.fn();
  const root = createRoot(container, {
    onCaughtError: errors,
    onUncaughtError: errors,
  });
  roots.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <Suspense fallback="pending">
          <Router />
        </Suspense>
      </StrictMode>,
    );
  });
  expect(container.textContent).toBe('start');
  return {
    register: api.register,
    container,
    errors,
    getRouter: () => api.router,
  };
};

test('an action started by a route mount effect updates the route', async () => {
  const response = deferred<Record<string, unknown>>({});
  let action!: Promise<unknown>;
  const Start = () => {
    useEffect(() => {
      action = callServerRsc('action#mount', []);
    }, []);
    return 'start';
  };
  decode
    .mockReturnValueOnce({
      root: <Children />,
      [getRouteSlotId('/start')]: <Start />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    })
    .mockReturnValue(response.promise);
  const container = document.createElement('div');
  document.body.append(container);
  const errors = vi.fn();
  const root = createRoot(container, {
    onCaughtError: errors,
    onUncaughtError: errors,
  });
  roots.push(root);
  await act(async () => {
    root.render(
      <Suspense fallback="pending">
        <Router />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe('start');
  expect(decode).toHaveBeenCalledTimes(2);
  await act(async () => {
    response.resolve({
      [getRouteSlotId('/next')]: 'next',
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: false,
      _value: 'returned',
    });
    expect(await action).toBe('returned');
  });
  expect(errors).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/next');
  expect(container.textContent).toBe('next');
});

test('a short-circuited action response still updates the route', async () => {
  const view = await mount();
  const request = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', request);
  view.register((next) => async (...args) => {
    if (args[2].type !== 'call') {
      return next(...args);
    }
    return {
      elements: {
        [getRouteSlotId('/offline')]: 'offline',
        [ROUTE_ID]: ['/offline', ''],
        [IS_STATIC_ID]: false,
      },
      value: 'cached',
    };
  });
  await act(async () => {
    expect(await callServerRsc('action#test', [])).toBe('cached');
  });
  expect(request).not.toHaveBeenCalled();
  expect(view.container.textContent).toBe('offline');
  expect(window.location.pathname).toBe('/offline');
  expect(view.errors).not.toHaveBeenCalled();
});

test('an action route update waits for response enhancers below Router order', async () => {
  const view = await mount();
  const delayed = deferred(undefined);
  view.register(
    (next) => async (path, params, options) => {
      const result = await next(path, params, options);
      await delayed.promise;
      return result;
    },
    99,
  );
  decode.mockReturnValue({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
    _value: 'returned',
  });
  let action!: Promise<unknown>;
  await act(async () => {
    action = callServerRsc('action#test', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(view.container.textContent).toBe('start');
  expect(window.location.pathname).toBe('/start');
  expect(view.errors).not.toHaveBeenCalled();
  await act(async () => {
    delayed.resolve(undefined);
    expect(await action).toBe('returned');
  });
  expect(view.container.textContent).toBe('next');
  expect(window.location.pathname).toBe('/next');
  expect(view.errors).not.toHaveBeenCalled();
});

test('an action route update pushes history after an earlier navigation', async () => {
  const view = await mount();
  decode.mockReturnValue({
    [getRouteSlotId('/middle')]: 'middle',
    [ROUTE_ID]: ['/middle', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await view.getRouter().push('/middle');
  });
  const pushState = vi.spyOn(window.history, 'pushState');
  decode.mockReturnValue({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await callServerRsc('action#test', []);
  });
  expect(window.location.pathname).toBe('/next');
  expect(view.container.textContent).toBe('next');
  expect(pushState).toHaveBeenCalledTimes(1);
});

test('an action response cancels an older navigation before its destination commits', async () => {
  const view = await mount();
  const request = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', request);
  const olderResponse = deferred<Record<string, unknown>>({});
  decode.mockReturnValueOnce(olderResponse.promise);
  let olderNavigation!: Promise<void>;
  await act(async () => {
    olderNavigation = view.getRouter().push('/older');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const signal = request.mock.calls[0]![1]!.signal!;
  expect(signal.aborted).toBe(false);
  const destination = deferred('next');
  const Destination = () => use(destination.promise);
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: <Destination />,
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await callServerRsc('action#test', []);
  });
  expect(view.container.textContent).toBe('start');
  expect(window.location.pathname).toBe('/start');
  expect.soft(signal.aborted).toBe(true);
  await act(async () => {
    olderResponse.resolve({
      [getRouteSlotId('/older')]: 'older',
      [ROUTE_ID]: ['/older', ''],
      [IS_STATIC_ID]: false,
    });
    await olderNavigation;
  });
  await act(async () => {
    destination.resolve('next');
  });
  expect(view.container.textContent).toBe('next');
  expect(window.location.pathname).toBe('/next');
});

test('a newer navigation supersedes a suspended action destination', async () => {
  const view = await mount();
  const destination = deferred('next');
  const Destination = () => use(destination.promise);
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: <Destination />,
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await callServerRsc('action#test', []);
  });
  expect(view.container.textContent).toBe('start');
  decode.mockReturnValueOnce({
    [getRouteSlotId('/final')]: 'final',
    [ROUTE_ID]: ['/final', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await view.getRouter().push('/final');
  });
  expect(view.container.textContent).toBe('final');
  await act(async () => {
    destination.resolve('next');
  });
  expect(view.container.textContent).toBe('final');
  expect(window.location.pathname).toBe('/final');
});

test('an action delayed by an enhancer navigates relative to the latest committed route', async () => {
  window.history.replaceState({}, '', '/start#section');
  const view = await mount();
  const delayed = deferred(undefined);
  view.register((next) => async (path, params, options) => {
    const result = await next(path, params, options);
    if (options.type === 'call') {
      await delayed.promise;
    }
    return result;
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/start')]: 'updated start',
    [ROUTE_ID]: ['/start', ''],
    [IS_STATIC_ID]: false,
  });
  let action!: Promise<unknown>;
  await act(async () => {
    action = callServerRsc('action#test', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/middle')]: 'middle',
    [ROUTE_ID]: ['/middle', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await view.getRouter().push('/middle');
  });
  expect(view.container.textContent).toBe('middle');
  const pushState = vi.spyOn(window.history, 'pushState');
  await act(async () => {
    delayed.resolve(undefined);
    await action;
  });
  expect(view.container.textContent).toBe('updated start');
  expect(window.location.pathname + window.location.hash).toBe('/start');
  expect(pushState).toHaveBeenCalledTimes(1);
});

test('an enhancer can discard an action response without cancelling navigation', async () => {
  const view = await mount();
  const response = deferred<Record<string, unknown>>({});
  const request = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', request);
  decode.mockReturnValueOnce(response.promise);
  let navigation!: Promise<void>;
  await act(async () => {
    navigation = view.getRouter().push('/middle');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const signal = request.mock.calls[0]![1]!.signal!;
  view.register((next) => async (path, params, options) => {
    const { value } = await next(path, params, options);
    return { elements: {}, value };
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
    _value: 'discarded',
  });
  await act(async () => {
    expect(await callServerRsc('action#test', [])).toBe('discarded');
  });
  expect.soft(signal.aborted).toBe(false);
  await act(async () => {
    response.resolve({
      [getRouteSlotId('/middle')]: 'middle',
      [ROUTE_ID]: ['/middle', ''],
      [IS_STATIC_ID]: false,
    });
    await navigation;
  });
  expect(view.container.textContent).toBe('middle');
  expect(window.location.pathname).toBe('/middle');
});

test('a rejected enhancer response cannot navigate or cancel pending work', async () => {
  const view = await mount();
  const response = deferred<Record<string, unknown>>({});
  const request = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', request);
  decode.mockReturnValueOnce(response.promise);
  let navigation!: Promise<void>;
  await act(async () => {
    navigation = view.getRouter().push('/middle');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const signal = request.mock.calls[0]![1]!.signal!;
  view.register((next) => async (...args) => {
    await next(...args);
    throw new Error('response rejected');
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await expect(callServerRsc('action#test', [])).rejects.toThrow(
      'response rejected',
    );
  });
  expect.soft(signal.aborted).toBe(false);
  await act(async () => {
    response.resolve({
      [getRouteSlotId('/middle')]: 'middle',
      [ROUTE_ID]: ['/middle', ''],
      [IS_STATIC_ID]: false,
    });
    await navigation;
  });
  expect(view.container.textContent).toBe('middle');
  expect(window.location.pathname).toBe('/middle');
});

test('an enhancer below Router order replaces the final destination and action value', async () => {
  const view = await mount();
  view.register(
    (next) =>
      async (...args) => {
        const { value } = await next(...args);
        return {
          elements: {
            [getRouteSlotId('/final')]: 'final',
            [ROUTE_ID]: ['/final', ''],
            [IS_STATIC_ID]: false,
          },
          value: String(value) + '-enhanced',
        };
      },
    50,
  );
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
    _value: 'returned',
  });
  await act(async () => {
    expect(await callServerRsc('action#test', [])).toBe('returned-enhanced');
  });
  expect(view.container.textContent).toBe('final');
  expect(window.location.pathname).toBe('/final');
  expect(view.errors).not.toHaveBeenCalled();
});

test('a Link renders outside a Root', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const errors = vi.fn();
  const root = createRoot(container, {
    onCaughtError: errors,
    onUncaughtError: errors,
  });
  roots.push(root);
  await act(async () => {
    root.render(<Link to="/somewhere">go</Link>);
  });

  expect(container.querySelector('a')?.getAttribute('href')).toBe('/somewhere');
  expect(errors).not.toHaveBeenCalled();
});

test('an action reports the route it was called from and applies its rerender', async () => {
  window.history.replaceState({}, '', '/start?q=1');
  const view = await mount();
  const request = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', request);
  decode.mockReturnValueOnce({
    [getRouteSlotId('/start')]: 'refreshed start',
    [ROUTE_ID]: ['/start', 'q=1'],
    [IS_STATIC_ID]: false,
    [IS_ORIGIN_ID]: true,
    [ETAGS_ID]: { [getRouteSlotId('/start')]: 'v1' },
    _value: 'done',
  });

  await act(async () => {
    expect(await callServerRsc('action#test', [])).toBe('done');
  });

  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ACTION_LOCATION_HEADER),
  ).toBe('/start?q=1');
  expect(view.container.textContent).toBe('refreshed start');
  expect(window.location.pathname).toBe('/start');

  decode.mockReturnValueOnce({ _value: 'again' });
  await act(async () => {
    await callServerRsc('action#test', []);
  });
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ETAGS_HEADER),
  ).toBe(JSON.stringify({ [getRouteSlotId('/start')]: 'v1' }));
  expect(view.errors).not.toHaveBeenCalled();
});

test('a rerender of the route an action came from is dropped once the user left it', async () => {
  const view = await mount();
  const delayed = deferred(undefined);
  view.register((next) => async (path, params, options) => {
    const result = await next(path, params, options);
    if (options.type === 'call') {
      await delayed.promise;
    }
    return result;
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/start')]: 'refreshed start',
    [ROUTE_ID]: ['/start', ''],
    [IS_STATIC_ID]: false,
    [IS_ORIGIN_ID]: true,
    _value: 'done',
  });
  let action!: Promise<unknown>;
  await act(async () => {
    action = callServerRsc('action#test', []);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/next')]: 'next',
    [ROUTE_ID]: ['/next', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await view.getRouter().push('/next');
  });
  expect(view.container.textContent).toBe('next');

  await act(async () => {
    delayed.resolve(undefined);
    expect(await action).toBe('done');
  });

  expect(view.container.textContent).toBe('next');
  expect(window.location.pathname).toBe('/next');
  expect(view.errors).not.toHaveBeenCalled();
});

test('a rerender of the route an action came from is dropped over a navigation it holds back', async () => {
  const view = await mount();
  const response = deferred<Record<string, unknown>>({});
  decode.mockReturnValueOnce(response.promise);
  let action!: Promise<unknown>;
  await act(async () => {
    startTransition(async () => {
      action = callServerRsc('action#test', []);
      await action;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  decode.mockReturnValueOnce({
    [getRouteSlotId('/middle')]: 'middle',
    [ROUTE_ID]: ['/middle', ''],
    [IS_STATIC_ID]: false,
  });
  await act(async () => {
    await view.getRouter().push('/middle');
  });
  expect(view.container.textContent).toBe('start');
  await act(async () => {
    response.resolve({
      [getRouteSlotId('/start')]: 'refreshed start',
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [IS_ORIGIN_ID]: true,
      _value: 'returned',
    });
    expect(await action).toBe('returned');
  });
  expect(view.container.textContent).toBe('middle');
  expect(window.location.pathname).toBe('/middle');
  expect(view.errors).not.toHaveBeenCalled();
});

test('an action keeps the headers of a request an inner enhancer builds', async () => {
  const view = await mount();
  let sent: Headers | undefined;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Request(input, init).headers;
      return new Response('{}');
    },
  );
  view.register(
    (next) => (path, params, options) =>
      next(path, params, {
        ...options,
        fetch: (input, init) =>
          options.fetch(
            new Request(new URL(String(input), window.location.href), init),
          ),
      }),
  );
  decode.mockReturnValueOnce({ _value: 'done' });

  await act(async () => {
    await callServerRsc('action#test', []);
  });

  expect(sent?.get(ACTION_LOCATION_HEADER)).toBe('/start');
  expect(sent?.has(ETAGS_HEADER)).toBe(true);
});

test('a rerender of the route an action came from survives a navigation within that route', async () => {
  const view = await mount();
  const response = deferred<Record<string, unknown>>({});
  decode.mockReturnValueOnce(response.promise);
  let action!: Promise<unknown>;
  await act(async () => {
    startTransition(async () => {
      action = callServerRsc('action#test', []);
      await action;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await view.getRouter().push('/start#details');
  });

  await act(async () => {
    response.resolve({
      [getRouteSlotId('/start')]: 'refreshed start',
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [IS_ORIGIN_ID]: true,
      _value: 'returned',
    });
    expect(await action).toBe('returned');
  });

  expect(view.container.textContent).toBe('refreshed start');
  expect(view.errors).not.toHaveBeenCalled();
});
