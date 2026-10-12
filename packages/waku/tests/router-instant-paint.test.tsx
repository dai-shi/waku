// @vitest-environment happy-dom

import {
  StrictMode,
  Suspense,
  act,
  lazy,
  use,
  useEffect,
  useLayoutEffect,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils-isomorphic/custom-errors.js';
import { ETAGS_ID, IMMUTABLE_ETAG } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc as callServerRsc } from '../src/minimal/client-runtime.js';
import { getDefaultRootStore } from '../src/minimal/client-utils/root-store.js';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import {
  ROUTER_STATE_ID,
  getRouterState,
} from '../src/router/client-utils/router-state.js';
import { Router, useRouter } from '../src/router/client.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/router-protocol.js';

type Payload = Record<string, unknown> & {
  [ETAGS_ID]?: Record<string, unknown>;
};

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
  [ETAGS_ID]: {
    root: IMMUTABLE_ETAG,
    [`route:${path}`]: IMMUTABLE_ETAG,
    ...extra[ETAGS_ID],
  },
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

test('an instant response adds required slots after an unrelated action merge', async () => {
  const clientState = Symbol('client-state');
  let elements: Readonly<Record<string | symbol, unknown>> = {};
  let mergeElements: ReturnType<typeof useMergeElements> | undefined;
  const Counter = () => {
    const current = use(useElementsPromise());
    const merge = useMergeElements();
    useEffect(() => {
      elements = current;
      mergeElements = merge;
    });
    return (
      <Suspense fallback="counter-waiting">
        <Slot id="counter" />
      </Suspense>
    );
  };
  const shell = nextPage();
  const initial = routePayload('/next', shell, {
    root: (
      <>
        <CaptureRouter />
        <Counter />
        <Children />
      </>
    ),
    clock: 'before',
    counter: 'counter-before',
  });
  window.history.replaceState({}, '', '/next');
  respond('/next', {
    ...initial,
    [ETAGS_ID]: {
      ...(initial[ETAGS_ID] as Record<string, unknown>),
      counter: 'counter-v1',
    },
  });
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  testHoisted.responses.set('/RSC/F/action/update.txt', [
    {
      counter: 'counter-action',
      [ETAGS_ID]: { counter: 'counter-v2' },
      _value: 'updated',
    },
  ]);

  const container = document.createElement('div');
  const errors = vi.fn();
  const Fallback = vi.fn(() => 'outer fallback');
  const root = createRoot(container, { onCaughtError: errors });
  try {
    await act(async () =>
      root.render(
        <Suspense fallback={<Fallback />}>
          <Router />
        </Suspense>,
      ),
    );
    expect(container.textContent).toBe('counter-beforenextbefore');
    await act(async () => {
      await router!.push('/start');
    });

    let navigated: Promise<void> | undefined;
    await act(async () => {
      navigated = router!.push('/next', { unstable_instant: true });
    });
    expect(container.textContent).toBe('counter-waitingnextwaiting');
    await act(async () => {
      expect(await callServerRsc('action#update', [])).toBe('updated');
    });
    expect(container.textContent).toBe('counter-actionnextwaiting');
    await act(async () => {
      await mergeElements!({ [clientState]: 'client-update' });
    });
    Fallback.mockClear();

    await act(async () => {
      next.resolve({
        ...routePayload('/next', shell, {
          clock: (
            <>
              after
              <Slot id="details" />
            </>
          ),
          counter: 'counter-response',
          details: 'details',
          [clientState]: 'response-state',
        }),
        [ETAGS_ID]: {
          'route:/next': IMMUTABLE_ETAG,
          counter: 'counter-response',
          details: IMMUTABLE_ETAG,
        },
      });
      await navigated;
    });

    expect(errors).not.toHaveBeenCalled();
    expect(Fallback).not.toHaveBeenCalled();
    expect(container.textContent).toBe('counter-actionnextafterdetails');
    expect(window.location.pathname).toBe('/next');
    expect(elements.details).toBe('details');
    expect(elements[clientState]).toBe('client-update');
    expect(getDefaultRootStore()?.etags).toMatchObject({
      counter: 'counter-v2',
      details: IMMUTABLE_ETAG,
    });
  } finally {
    act(() => root.unmount());
    next.resolve({});
  }
});

test('a superseded instant response cannot add slots while its replacement is pending', async () => {
  let elements: Readonly<Record<string | symbol, unknown>> = {};
  const CaptureElements = () => {
    const current = use(useElementsPromise());
    useEffect(() => {
      elements = current;
    });
    return null;
  };
  const initial = routePayload('/next', nextPage(), {
    root: (
      <>
        <CaptureRouter />
        <CaptureElements />
        <Children />
      </>
    ),
    clock: 'before',
  });
  window.history.replaceState({}, '', '/next');
  respond('/next', initial);
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  const replacement = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  respond('/replacement', replacement.promise);

  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      await router!.push('/start');
    });
    let instantNavigation: Promise<void> | undefined;
    await act(async () => {
      instantNavigation = router!.push('/next', { unstable_instant: true });
    });
    expect(container.textContent).toBe('nextwaiting');

    let navigated: Promise<void> | undefined;
    await act(async () => {
      navigated = router!.push('/replacement');
      await instantNavigation;
    });
    const pending = elements;
    await act(async () => {
      next.resolve(
        routePayload('/next', nextPage(), {
          clock: 'stale-clock',
          stale: 'stale-slot',
        }),
      );
      await next.promise;
    });
    expect(elements).toBe(pending);
    expect('stale' in elements).toBe(false);
    expect(container.textContent).not.toContain('stale');

    await act(async () => {
      replacement.resolve(routePayload('/replacement', 'replacement'));
      await navigated;
    });
    expect(container.textContent).toBe('replacement');
    expect(window.location.pathname).toBe('/replacement');
    expect('stale' in elements).toBe(false);
  } finally {
    act(() => root.unmount());
    next.resolve({});
    replacement.resolve({});
  }
});

test('a batched replacement overwrites the superseded instant holes', async () => {
  window.history.replaceState({}, '', '/next');
  respond('/next', routePayload('/next', nextPage(), { clock: 'before' }));
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  const replacement = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  respond('/replacement', replacement.promise);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      await router!.push('/start');
    });
    let second: Promise<void> | undefined;
    await act(async () => {
      const first = router!.push('/next', { unstable_instant: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.textContent).toBe('start');
      second = router!.push('/replacement');
      await first;
    });
    await act(async () => {
      replacement.resolve(
        routePayload('/replacement', <Slot id="clock" />, {
          clock: 'replacement-clock',
        }),
      );
      await second;
    });
    expect(container.textContent).toBe('replacement-clock');
    expect(window.location.pathname).toBe('/replacement');
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
      replacement.resolve({});
    });
  }
});

test('a batched replacement discards an uncommitted prefetched immutable slot', async () => {
  window.history.replaceState({}, '', '/start');
  respond('/start', routePayload('/start', 'start'));
  const next = Promise.withResolvers<Payload>();
  const replacement = Promise.withResolvers<Payload>();
  respond('/next', next.promise, 'q=1');
  respond(
    '/next',
    routePayload(
      '/next',
      <Slot id="clock" />,
      {
        clock: 'prefetched-clock',
        [ETAGS_ID]: { clock: IMMUTABLE_ETAG },
      },
      'q=2',
    ),
    'q=2',
  );
  respond('/replacement', replacement.promise);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      router!.prefetch('/next?q=1');
      router!.prefetch('/next?q=2');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    let second: Promise<void> | undefined;
    await act(async () => {
      const first = router!.push('/next?q=1', { unstable_instant: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.textContent).toBe('start');
      second = router!.push('/replacement');
      await first;
    });
    await act(async () => {
      replacement.resolve(
        routePayload('/replacement', <Slot id="clock" />, {
          clock: 'replacement-clock',
        }),
      );
      await second;
    });
    expect(container.textContent).toBe('replacement-clock');
    expect(window.location.pathname).toBe('/replacement');
    expect(getDefaultRootStore()?.etags.clock).toBeUndefined();
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
      replacement.resolve({});
    });
  }
});

test.each([false, true])(
  'a replacement wins after an instant response resolves (painted: %s)',
  async (painted) => {
    window.history.replaceState({}, '', '/next');
    const shell = nextPage();
    respond('/next', routePayload('/next', shell, { clock: 'before' }));
    respond('/start', startPayload());
    const next = Promise.withResolvers<Payload>();
    const replacement = Promise.withResolvers<Payload>();
    respond('/next', next.promise);
    respond('/replacement', replacement.promise);

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Router />));
      await act(async () => {
        await router!.push('/start');
      });
      let instantNavigation: Promise<void> | undefined;
      if (painted) {
        await act(async () => {
          instantNavigation = router!.push('/next', { unstable_instant: true });
        });
        expect(container.textContent).toBe('nextwaiting');
      }
      let navigated: Promise<void> | undefined;
      await act(async () => {
        instantNavigation ??= router!.push('/next', { unstable_instant: true });
        next.resolve(
          routePayload('/next', shell, {
            clock: 'after',
            shared: 'from-instant',
          }),
        );
        await instantNavigation;
        navigated = router!.push('/replacement');
      });
      await act(async () => {
        replacement.resolve(
          routePayload('/replacement', <Slot id="shared" />, {
            shared: 'from-replacement',
          }),
        );
        await navigated;
      });
      expect(window.location.pathname).toBe('/replacement');
      expect(container.textContent).toBe('from-replacement');
    } finally {
      await act(async () => {
        root.unmount();
        next.resolve({});
        replacement.resolve({});
      });
    }
  },
);

test.each([
  'counter-action',
  'counter-response',
  'before-response',
  'identical-action',
])(
  'starting a replacement preserves an action queued around the instant response (%s)',
  async (order) => {
    const identical =
      order === 'before-response' || order === 'identical-action';
    const counter = identical ? 'counter-response' : order;
    const actionEtag = identical ? 'counter-v1' : 'counter-v2';
    const extraEtag = identical ? 'extra-v1' : 'extra-v2';
    window.history.replaceState({}, '', '/next');
    const shell = nextPage();
    const rootElement = (
      <>
        <CaptureRouter />
        <Suspense fallback="counter-waiting">
          <Slot id="counter" />
        </Suspense>
        <Children />
      </>
    );
    respond(
      '/next',
      routePayload('/next', shell, {
        root: rootElement,
        counter: 'counter-before',
        clock: 'before',
        [ETAGS_ID]: {
          root: IMMUTABLE_ETAG,
          'route:/next': IMMUTABLE_ETAG,
          counter: 'counter-v0',
        },
      }),
    );
    respond('/start', startPayload());
    const next = Promise.withResolvers<Payload>();
    const replacement = Promise.withResolvers<Payload>();
    respond('/next', next.promise);
    respond('/replacement', replacement.promise);
    testHoisted.responses.set('/RSC/F/action/update.txt', [
      {
        counter,
        extra: 'extra',
        [ETAGS_ID]: { counter: actionEtag, extra: extraEtag },
        _value: 'updated',
      },
    ]);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Router />));
      await act(async () => {
        await router!.push('/start');
      });
      let first: Promise<void> | undefined;
      await act(async () => {
        first = router!.push('/next', { unstable_instant: true });
      });
      let second: Promise<void> | undefined;
      await act(async () => {
        if (order === 'before-response') {
          expect(await callServerRsc('action#update', [])).toBe('updated');
        }
        next.resolve(
          routePayload('/next', shell, {
            root: rootElement,
            counter: 'counter-response',
            clock: 'after',
            extra: 'extra',
            [ETAGS_ID]: { counter: 'counter-v1', extra: 'extra-v1' },
          }),
        );
        await first;
        if (order !== 'before-response') {
          expect(await callServerRsc('action#update', [])).toBe('updated');
        }
        second = router!.push('/replacement');
      });
      await act(async () => {
        replacement.resolve(
          routePayload('/replacement', 'replacement', { root: rootElement }),
        );
        await second;
      });
      expect(container.textContent).toBe(counter + 'replacement');
      expect(getDefaultRootStore()?.etags.counter).toBe(actionEtag);
      expect(getDefaultRootStore()?.etags.extra).toBe(extraEtag);
    } finally {
      await act(async () => {
        root.unmount();
        next.resolve({});
        replacement.resolve({});
      });
    }
  },
);

test('a same-route navigation retains the instant response slots before settlement commits', async () => {
  window.history.replaceState({}, '', '/next');
  const shell = nextPage();
  respond('/next', routePayload('/next', shell, { clock: 'before' }));
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  const container = document.createElement('div');
  const errors = vi.fn();
  const root = createRoot(container, { onCaughtError: errors });
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      await router!.push('/start');
    });
    let first: Promise<void> | undefined;
    await act(async () => {
      first = router!.push('/next', { unstable_instant: true });
    });
    await act(async () => {
      next.resolve(
        routePayload('/next', shell, {
          clock: <Slot id="details" />,
          details: 'details',
        }),
      );
      await first;
      await router!.push('/next#section');
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe('nextdetails');
    expect(window.location.hash).toBe('#section');
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
    });
  }
});

test('an instant response can introduce a slot named constructor', async () => {
  window.history.replaceState({}, '', '/next');
  const shell = nextPage();
  respond('/next', routePayload('/next', shell, { clock: 'before' }));
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  const container = document.createElement('div');
  const errors = vi.fn();
  const root = createRoot(container, { onCaughtError: errors });
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      await router!.push('/start');
    });
    let navigated: Promise<void> | undefined;
    await act(async () => {
      navigated = router!.push('/next', { unstable_instant: true });
    });
    await act(async () => {
      next.resolve(
        routePayload('/next', shell, {
          clock: <Slot id="constructor" />,
          constructor: 'details',
        }),
      );
      await navigated;
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe('nextdetails');
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
    });
  }
});

test('an urgent render of the instant shell cannot release a queued settlement', async () => {
  const onSuperseded = vi.fn();
  let elements: Payload = {};
  let merge: ReturnType<typeof useMergeElements> | undefined;
  const Capture = () => {
    const current = use(useElementsPromise());
    const mergeElements = useMergeElements();
    useLayoutEffect(() => {
      elements = current;
      merge = mergeElements;
    });
    return layout();
  };
  window.history.replaceState({}, '', '/next');
  const shell = nextPage();
  respond(
    '/next',
    routePayload('/next', shell, { root: <Capture />, clock: 'before' }),
  );
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  const replacement = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  respond('/replacement', replacement.promise);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Router />));
    await act(async () => {
      await router!.push('/start');
    });
    let first: Promise<void> | undefined;
    await act(async () => {
      first = router!.push('/next', {
        unstable_instant: true,
        unstable_onSuperseded: onSuperseded,
      });
    });
    const signal = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.signal;
    expect(signal).toBeDefined();
    let second: Promise<void> | undefined;
    await act(async () => {
      next.resolve(
        routePayload('/next', shell, {
          clock: 'after',
          shared: 'from-instant',
        }),
      );
      await first;
      const updated = combineElements(elements, { unrelated: 'urgent' });
      flushSync(() => {
        void merge!({}, () =>
          Object.assign(Promise.resolve(updated), {
            status: 'fulfilled',
            value: updated,
          }),
        );
      });
      second = router!.push('/replacement');
      expect(onSuperseded).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(false);
    });
    await act(async () => {
      replacement.resolve(
        routePayload('/replacement', <Slot id="shared" />, {
          shared: 'from-replacement',
        }),
      );
      await second;
    });
    expect(container.textContent).toBe('from-replacement');
    expect(elements.unrelated).toBe('urgent');
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
      replacement.resolve({});
    });
  }
});

test('a repeated snapshot and effect replay do not restart an instant redirect follow', async () => {
  let elements: Payload = {};
  let merge: ReturnType<typeof useMergeElements> | undefined;
  const Capture = () => {
    const current = use(useElementsPromise());
    const mergeElements = useMergeElements();
    useLayoutEffect(() => {
      elements = current;
      merge = mergeElements;
    });
    return layout();
  };
  const redirect = createCustomError('redirect', {
    status: 307,
    location: '/replacement',
  });
  const Redirect = () => {
    throw redirect;
  };
  window.history.replaceState({}, '', '/next');
  const shell = nextPage();
  respond(
    '/next',
    routePayload('/next', shell, { root: <Capture />, clock: 'before' }),
  );
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  const replacement = Promise.withResolvers<Payload>();
  respond('/next', next.promise);
  respond('/replacement', replacement.promise);
  const container = document.createElement('div');
  const root = createRoot(container, { onCaughtError: () => {} });
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Router />
        </StrictMode>,
      ),
    );
    await act(async () => {
      await router!.push('/start');
    });
    let first: Promise<void> | undefined;
    await act(async () => {
      first = router!.push('/next', { unstable_instant: true });
    });
    await act(async () => {
      next.resolve(routePayload('/next', shell, { clock: <Redirect /> }));
      await first;
    });
    const state = getRouterState(elements);
    expect(state).toBeDefined();
    await act(async () => {
      await merge!({ [ROUTER_STATE_ID]: { ...state } });
    });
    await act(async () => {
      replacement.resolve(routePayload('/replacement', 'replacement'));
    });
    expect(container.textContent).toBe('replacement');
    expect(window.location.pathname).toBe('/replacement');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).includes('R/replacement'),
        ),
    ).toHaveLength(1);
  } finally {
    await act(async () => {
      root.unmount();
      next.resolve({});
      replacement.resolve({});
    });
  }
});
