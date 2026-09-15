// @vitest-environment happy-dom

import { Suspense, act, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { ETAGS_ID, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
} from '../src/minimal/client.js';
import { Router, useRouter } from '../src/router/client.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

type Payload = Record<string, unknown>;

const testHoisted = vi.hoisted(() => ({
  responses: new Map<string, Array<Payload | Promise<Payload>>>(),
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: vi.fn(async (responsePromise: Promise<Response>) => {
      const url = await (await responsePromise).text();
      const payload = testHoisted.responses.get(url)?.shift();
      if (!payload) {
        throw new Error(`unexpected request: ${url}`);
      }
      return payload;
    }),
    encodeReply: vi.fn(async () => ''),
    createTemporaryReferenceSet: vi.fn(() => new Map()),
  },
}));

const respond = (
  path: string,
  payload: Payload | Promise<Payload>,
  query = '',
) => {
  const url = `/RSC/R${path}.txt?${new URLSearchParams({ query })}`;
  testHoisted.responses.set(url, [
    ...(testHoisted.responses.get(url) ?? []),
    payload,
  ]);
};

let router: ReturnType<typeof useRouter> | undefined;

const CaptureRouter = () => {
  const value = useRouter();
  useEffect(() => {
    router = value;
  });
  return null;
};

const layout = () => (
  <>
    <CaptureRouter />
    <Children />
  </>
);

const routePayload = (
  path: string,
  shell: unknown,
  extra: Payload = {},
  query = '',
): Payload => ({
  root: layout(),
  [`route:${path}`]: shell,
  ...extra,
  [ROUTE_ID]: [path, query],
  [IS_STATIC_ID]: false,
  [ETAGS_ID]: { root: IMMUTABLE_ETAG, [`route:${path}`]: IMMUTABLE_ETAG },
});

const startPayload = (): Payload => ({
  'route:/start': <p>start</p>,
  [ROUTE_ID]: ['/start', ''],
  [IS_STATIC_ID]: false,
});

const nextPage = () => (
  <>
    <h1>next</h1>
    <Suspense fallback={<i>waiting</i>}>
      <Slot id="clock" />
    </Suspense>
  </>
);

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input) => new Response(String(input)),
  );
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('an instant navigation paints the cached shell before its response', async () => {
  window.history.replaceState({}, '', '/next');
  respond('/next', routePayload('/next', nextPage(), { clock: 'tick-1' }));
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  respond('/next', next.promise);

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Router />);
  });
  expect(container.textContent).toBe('nexttick-1');

  await act(async () => {
    await router!.push('/start');
  });
  expect(container.textContent).toBe('start');

  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/next', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    next.resolve(routePayload('/next', nextPage(), { clock: 'tick-2' }));
    await navigated;
  });
  expect(container.textContent).toBe('nexttick-2');

  act(() => root.unmount());
});

test('an instant navigation paints a primitive shell before its response', async () => {
  window.history.replaceState({}, '', '/about');
  respond('/about', routePayload('/about', 'about'));
  respond('/start', startPayload());
  const about = Promise.withResolvers<Payload>();
  respond('/about', about.promise);

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Router />);
  });
  expect(container.textContent).toBe('about');

  await act(async () => {
    await router!.push('/start');
  });
  expect(container.textContent).toBe('start');

  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/about', { unstable_instant: true });
  });
  expect(container.textContent).toBe('about');

  await act(async () => {
    about.resolve(routePayload('/about', 'about'));
    await navigated;
  });
  expect(container.textContent).toBe('about');

  act(() => root.unmount());
});

test('an instant shell stays painted while the response copy is streaming', async () => {
  window.history.replaceState({}, '', '/streamed');
  respond(
    '/streamed',
    routePayload('/streamed', nextPage(), { clock: 'before' }),
  );
  respond('/start', startPayload());
  const streamed = Promise.withResolvers<Payload>();
  respond('/streamed', streamed.promise);
  const shellReady = Promise.withResolvers<void>();
  const StreamingShell = lazy(async () => {
    await shellReady.promise;
    return { default: nextPage };
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Suspense fallback={<b>outer fallback</b>}>
        <Router />
      </Suspense>,
    );
  });
  await act(async () => {
    await router!.push('/start');
  });
  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/streamed', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    streamed.resolve(
      routePayload('/streamed', <StreamingShell />, { clock: 'after' }),
    );
    await navigated;
  });

  expect(container.textContent).toBe('nextafter');
  await act(async () => {
    shellReady.resolve();
  });
  act(() => root.unmount());
});

test('an instant shell painted from a prefetch stays while the response copy is streaming', async () => {
  window.history.replaceState({}, '', '/home');
  respond('/home', routePayload('/home', <p>home</p>));
  // two prefetches of one route: the shell comes from the one that arrived,
  // the response from the one still streaming
  const q1 = Promise.withResolvers<Payload>();
  respond('/prefetched', q1.promise, 'q=1');
  respond(
    '/prefetched',
    routePayload('/prefetched', nextPage(), { clock: 'before' }, 'q=2'),
    'q=2',
  );
  const shellReady = Promise.withResolvers<void>();
  const StreamingShell = lazy(async () => {
    await shellReady.promise;
    return { default: nextPage };
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Suspense fallback={<b>outer fallback</b>}>
        <Router />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe('home');
  await act(async () => {
    router!.prefetch('/prefetched?q=1');
    router!.prefetch('/prefetched?q=2');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/prefetched?q=1', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    q1.resolve(
      routePayload(
        '/prefetched',
        <StreamingShell />,
        { clock: 'after' },
        'q=1',
      ),
    );
    await navigated;
  });

  expect(container.textContent).toBe('nextafter');
  await act(async () => {
    shellReady.resolve();
  });
  act(() => root.unmount());
});
