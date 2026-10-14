// @vitest-environment happy-dom

import { Suspense, act, startTransition, use, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_HEADER } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc } from '../src/minimal/client-runtime.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { unstable_createCustomError as createCustomError } from '../src/minimal/server.js';
import * as loader from '../src/router/client-core-utils/load.js';
import {
  ErrorBoundary,
  Router,
  Slice,
  useRouter,
} from '../src/router/client.js';
import {
  HAS404_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';

type Elements = Record<string | symbol, unknown>;

const mocks = vi.hoisted(() => ({
  queue: [] as Array<Elements | Promise<Elements>>,
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: (response: Promise<Response>) => {
      const data = mocks.queue.shift();
      if (!data) {
        throw new Error('Unexpected RSC request');
      }
      return response.then(() => data);
    },
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const defer = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const controls = new Map<
  string,
  {
    router: ReturnType<typeof useRouter>;
    merge: ReturnType<typeof useMergeElements>;
  }
>();
let root: ReturnType<typeof createRoot> | undefined;

const Probe = ({ id }: { id: string }) => {
  const router = useRouter();
  const merge = useMergeElements();
  const elements = use(useElementsPromise());
  useLayoutEffect(() => {
    controls.set(id, { router, merge });
  });
  return (
    <>
      <output data-route={id}>{router.path}</output>
      <output data-sidebar={id}>{String(elements.sidebar ?? '')}</output>
    </>
  );
};

const payload = (path: string, body: ReactNode, id = 'a'): Elements => ({
  root: (
    <>
      <Probe id={id} />
      <Children />
    </>
  ),
  [ROUTE_ID]: [path, ''],
  [IS_STATIC_ID]: false,
  [getRouteSlotId(path)]: body,
});

const mount = async (children: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Suspense fallback={<p>outer fallback</p>}>{children}</Suspense>,
    );
    await flush();
  });
  return container;
};

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/one');
  clearInitialRscEntries();
  mocks.queue = [];
  controls.clear();
  vi.stubGlobal('fetch', async () => new Response('{}'));
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  clearInitialRscEntries();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('client suspension and urgent unrelated merges do not advance the route', async () => {
  const push = vi.spyOn(window.history, 'pushState');
  const ready = defer<void>();
  const Page = () => {
    use(ready.promise);
    return <p>page two</p>;
  };
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname).toBe('/one');
  await act(async () => {
    await controls.get('a')!.merge({ sidebar: 'updated' });
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname).toBe('/one');
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.textContent).toContain('page two');
  expect(view.querySelector('output')?.textContent).toBe('/two');
  expect(window.location.pathname).toBe('/two');
  expect(view.querySelector('[data-sidebar]')?.textContent).toBe('updated');
  expect(push).toHaveBeenCalledTimes(1);
});

test('normal navigation queues its pending elements before the response arrives', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const settings = defer<Elements>();
  mocks.queue.push(settings.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/settings');
      await flush();
    });
    const inspect = vi.fn((prev: Promise<Elements>) => prev);
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({}, inspect);
      });
      await flush();
    });
    const queued = inspect.mock.calls.at(-1)![0];
    expect(
      await Promise.race([
        queued.then(() => 'settled'),
        flush().then(() => 'pending'),
      ]),
    ).toBe('pending');
    expect(view.textContent).toContain('page one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      settings.resolve(payload('/settings', <p>settings</p>));
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('settings');
    expect(window.location.pathname).toBe('/settings');
  } finally {
    await act(async () => {
      settings.resolve(payload('/settings', <p>settings</p>));
      await pushed;
      await flush();
    });
  }
});

test('partial actions survive the pending normal-navigation queue', async () => {
  mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar: 'before' });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    mocks.queue.push({ sidebar: 'action', _value: 'updated' });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/two', <p>page two</p>),
        sidebar: 'navigation',
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test('an origin action cannot restore route metadata over a reload rewrite', async () => {
  const Destination = () => {
    const elements = use(useElementsPromise());
    return (
      <p
        data-static={String(elements[IS_STATIC_ID])}
        data-has404={String(elements[HAS404_ID])}
      >
        rewritten page
      </p>
    );
  };
  mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar: 'before' });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let reloaded: Promise<void> | undefined;
  try {
    await act(async () => {
      reloaded = controls.get('a')!.router.reload();
      await flush();
    });
    mocks.queue.push({
      ...payload('/one', <p>origin action page</p>),
      [HAS404_ID]: true,
      [IS_ORIGIN_ID]: true,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/two', <Destination />),
        [IS_STATIC_ID]: true,
        [HAS404_ID]: false,
        _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
      });
      await reloaded;
      await flush();
    });
    expect(view.textContent).toContain('rewritten page');
    expect(view.textContent).not.toContain('origin action page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(
      view.querySelector('[data-static]')?.getAttribute('data-static'),
    ).toBe('true');
    expect(
      view.querySelector('[data-has404]')?.getAttribute('data-has404'),
    ).toBe('false');
    expect(controls.get('a')!.router.path).toBe('/two');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await reloaded;
      await flush();
    });
  }
});

test('a lazy slice settling during normal navigation keeps the shell visible', async () => {
  const fallbackMounted = vi.fn();
  const Fallback = () => {
    useLayoutEffect(fallbackMounted, []);
    return <p>outer fallback</p>;
  };
  const slice = defer<Elements>();
  const response = defer<Elements>();
  mocks.queue.push(
    {
      ...payload('/one', <p>page one</p>),
      root: (
        <>
          <Probe id="a" />
          <Slice id="aside" lazy fallback={<p>slice fallback</p>} />
          <Children />
        </>
      ),
      _etags: { root: 1 },
    },
    slice.promise,
  );
  const view = await mount(
    <Suspense fallback={<Fallback />}>
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />
    </Suspense>,
  );
  fallbackMounted.mockClear();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({ sidebar: 'client' });
      });
      await flush();
    });
    expect(fallbackMounted).not.toHaveBeenCalled();
    await act(async () => {
      slice.resolve({
        'slice:aside': <aside>loaded slice</aside>,
        _etags: { 'slice:aside': 1 },
      });
      await flush();
    });
    expect(fallbackMounted).not.toHaveBeenCalled();
    expect(view.textContent).toContain('page one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/two')]: <p>page two</p>,
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.textContent).toContain('loaded slice');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
    expect(fallbackMounted).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      slice.resolve({});
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test('a replacement preserves client updates queued before it starts', async () => {
  const state = Symbol('client state');
  const ClientState = () => {
    const elements = use(useElementsPromise());
    return <output data-client-state>{String(elements[state] ?? '')}</output>;
  };
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <ClientState />
        <Children />
      </>
    ),
    sidebar: 'before',
    _etags: { root: 1, sidebar: 'v1' },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  await act(async () => {
    await controls.get('a')!.merge({ [state]: 'before' });
    await flush();
  });
  const first = defer<Elements>();
  const second = defer<Elements>();
  mocks.queue.push(first.promise, second.promise);
  let pushed: Promise<void> | undefined;
  let replacement: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({ sidebar: 'client', [state]: 'client' });
        replacement = controls.get('a')!.router.push('/three');
      });
      await flush();
    });
    await act(async () => {
      second.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
      });
      await replacement;
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
    expect(view.querySelector('[data-client-state]')?.textContent).toBe(
      'client',
    );
    expect(window.location.pathname).toBe('/three');
  } finally {
    await act(async () => {
      first.resolve({});
      second.resolve({});
      await Promise.all([pushed, replacement]);
      await flush();
    });
  }
});

test.each(['none', 'client', 'action'] as const)(
  'a replacement replaces response-only slots but keeps independent writes (write: %s)',
  async (write) => {
    const ready = defer<void>();
    const replacement = defer<Elements>();
    let pushed: Promise<void> | undefined;
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', <Page />),
      sidebar: 'two',
      _etags: { sidebar: 'two-v1' },
    });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      expect(view.textContent).toContain('page one');
      if (write === 'action') {
        mocks.queue.push({
          sidebar: 'two',
          _etags: { sidebar: 'two-v1' },
          _value: 'updated',
        });
        await act(async () => {
          expect(await unstable_callServerRsc('actions#update', [])).toBe(
            'updated',
          );
          await flush();
        });
      }
      mocks.queue.push(replacement.promise);
      await act(async () => {
        startTransition(() => {
          if (write === 'client') {
            void controls.get('a')!.merge({ sidebar: 'client' });
          }
          pushed = controls.get('a')!.router.push('/three');
        });
        await flush();
      });
      await act(async () => {
        replacement.resolve({
          ...payload('/three', <p>page three</p>),
          sidebar: 'three',
          _etags: { sidebar: 'three-v1' },
        });
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        write === 'none' ? 'three' : write === 'action' ? 'two' : 'client',
      );
      expect(window.location.pathname).toBe('/three');
      mocks.queue.push(payload('/three', <p>page three</p>));
      await act(async () => {
        await controls.get('a')!.router.reload();
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(JSON.parse(headers.get(ETAGS_HEADER) ?? '{}').sidebar).toBe(
        write === 'none'
          ? 'three-v1'
          : write === 'action'
            ? 'two-v1'
            : undefined,
      );
    } finally {
      await act(async () => {
        ready.resolve();
        replacement.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test.each([
  ['client', 'client', undefined],
  ['action', 'two', 'two-v1'],
  ['baseline-action', 'before', 'action-v2'],
  ['remove', '', undefined],
] as const)(
  'rollback preserves independent changes to committed slots (write: %s)',
  async (write, expectedSidebar, expectedEtag) => {
    const state = Symbol('client state');
    const ClientState = () => {
      const elements = use(useElementsPromise());
      return (
        <output
          data-client-state
          data-sidebar-present={Object.hasOwn(elements, 'sidebar')}
        >
          {Object.hasOwn(elements, state) ? String(elements[state]) : 'absent'}
        </output>
      );
    };
    const ready = defer<void>();
    const replacement = defer<Elements>();
    let pushed: Promise<void> | undefined;
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: (
        <>
          <Probe id="a" />
          <ClientState />
          <Children />
        </>
      ),
      sidebar: 'before',
      _etags: { root: 1, sidebar: 'before-v1' },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    await act(async () => {
      await controls.get('a')!.merge({ [state]: 'before' });
      await flush();
    });
    mocks.queue.push({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/two')]: <Page />,
      sidebar: 'two',
      _etags: { sidebar: 'two-v1' },
    });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      if (write === 'action' || write === 'baseline-action') {
        mocks.queue.push({
          sidebar: expectedSidebar,
          _etags: { sidebar: expectedEtag },
          _value: 'updated',
        });
        await act(async () => {
          expect(await unstable_callServerRsc('actions#update', [])).toBe(
            'updated',
          );
          await flush();
        });
      }
      mocks.queue.push(replacement.promise);
      await act(async () => {
        startTransition(() => {
          if (write === 'remove') {
            void controls.get('a')!.merge({}, (prev) =>
              prev.then((elements) =>
                combineElements({}, elements, {
                  filter: (key) => key !== 'sidebar' && key !== state,
                }),
              ),
            );
          } else {
            void controls.get('a')!.merge({
              ...(write === 'client' ? { sidebar: 'client' } : {}),
              [state]: 'client',
            });
          }
          pushed = controls.get('a')!.router.push('/three');
        });
        await flush();
      });
      await act(async () => {
        replacement.resolve({
          [ROUTE_ID]: ['/three', ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId('/three')]: <p>page three</p>,
        });
        await pushed;
        ready.resolve();
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        expectedSidebar,
      );
      expect(view.querySelector('[data-client-state]')?.textContent).toBe(
        write === 'remove' ? 'absent' : 'client',
      );
      expect(
        view
          .querySelector('[data-sidebar-present]')
          ?.getAttribute('data-sidebar-present'),
      ).toBe(String(write !== 'remove'));
      expect(window.location.pathname).toBe('/three');
      mocks.queue.push({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
        sidebar: 'reloaded',
        _etags: { sidebar: 'reload-v1' },
      });
      await act(async () => {
        await controls.get('a')!.router.reload();
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(JSON.parse(headers.get(ETAGS_HEADER) ?? '{}').sidebar).toBe(
        expectedEtag,
      );
    } finally {
      await act(async () => {
        ready.resolve();
        replacement.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test('rollback preserves a removal not represented in the accepted prefetch', async () => {
  const ready = defer<void>();
  const replacement = defer<Elements>();
  let pushed: Promise<void> | undefined;
  const Page = () => {
    use(ready.promise);
    return <p>superseded page</p>;
  };
  const initial: Elements = {
    ...payload('/one', <p>page one</p>),
    sidebar: 'before',
    _etags: { root: 1, sidebar: 'before-v1' },
  };
  mocks.queue.push(initial);
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    root: initial.root,
    [ROUTE_ID]: ['/two', ''],
    [IS_STATIC_ID]: false,
    [getRouteSlotId('/two')]: <Page />,
    _etags: { root: 1 },
  });
  try {
    await act(async () => {
      controls.get('a')!.router.prefetch('/two');
      await flush();
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    mocks.queue.push(replacement.promise);
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({}, (prev) =>
          prev.then((elements) =>
            combineElements({}, elements, {
              filter: (key) => key !== 'sidebar',
            }),
          ),
        );
        pushed = controls.get('a')!.router.push('/three');
      });
      await flush();
    });
    await act(async () => {
      replacement.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
      });
      await pushed;
      ready.resolve();
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('');
    expect(window.location.pathname).toBe('/three');
  } finally {
    await act(async () => {
      ready.resolve();
      replacement.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each(['pending', 'failed'] as const)(
  'a replacement recognizes response-only slots across a %s intermediate request',
  async (intermediate) => {
    const ready = defer<void>();
    const middle = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({ ...payload('/two', <Page />), sidebar: 'two' });
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      mocks.queue.push(middle.promise);
      await act(async () => {
        pushed = controls.get('a')!.router.push('/middle');
        void pushed.catch(() => {});
        await flush();
      });
      mocks.queue.push({
        ...payload('/three', <p>page three</p>),
        sidebar: 'three',
      });
      await act(async () => {
        if (intermediate === 'failed') {
          middle.reject(new Error('offline'));
          await expect(pushed).rejects.toThrow('offline');
        }
        await controls.get('a')!.router.push('/three');
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe('three');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        ready.resolve();
        middle.resolve({});
        await pushed?.catch(() => {});
        await flush();
      });
    }
  },
);

test('a query navigation preserves action data without taking its old composition', async () => {
  mocks.queue.push({
    ...payload('/one', <p>initial page</p>),
    sidebar: 'before',
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/one?q=next');
      await flush();
    });
    mocks.queue.push({
      [getRouteSlotId('/one')]: <p>old query action page</p>,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/one', <p>destination page</p>),
        [ROUTE_ID]: ['/one', 'q=next'],
        sidebar: 'navigation',
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('destination page');
    expect(view.textContent).not.toContain('old query action page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(controls.get('a')!.router.query).toBe('q=next');
    expect(window.location.search).toBe('?q=next');
  } finally {
    await act(async () => {
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each([false, true])(
  'an instant response is adopted once, while a redirect follow commits its destination (redirect: %s)',
  async (redirect) => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      [getRouteSlotId('/two')]: <p>cached page two</p>,
      _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    const response = defer<Elements>();
    mocks.queue.push(response.promise);
    if (redirect) {
      mocks.queue.push(payload('/three', <p>followed page three</p>));
    }
    let pushed!: Promise<void>;
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two', {
        unstable_instant: true,
      });
      await flush();
    });
    expect(view.textContent).toContain('cached page two');
    expect(view.querySelector('output')?.textContent).toBe('/two');
    expect(window.location.pathname).toBe('/two');
    expect(push).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (redirect) {
        response.reject(createCustomError('moved', { location: '/three' }));
      } else {
        response.resolve({ [ROUTE_ID]: ['/two', ''], sidebar: 'response' });
      }
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain(
      redirect ? 'followed page three' : 'cached page two',
    );
    expect(view.querySelector('output')?.textContent).toBe(
      redirect ? '/three' : '/two',
    );
    expect(window.location.pathname).toBe(redirect ? '/three' : '/two');
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(redirect ? 1 : 0);
    expect(scroll).toHaveBeenCalledTimes(redirect ? 2 : 1);
    if (!redirect) {
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        'response',
      );
    }
    expect(mocks.queue).toEqual([]);
  },
);

test('a same-route navigation cancels an already queued suspended destination', async () => {
  const ready = defer<void>();
  const Page = () => {
    use(ready.promise);
    return <p>cancelled page</p>;
  };
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  await act(async () => {
    await controls.get('a')!.router.push('/one#anchor');
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.textContent).not.toContain('cancelled page');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname + window.location.hash).toBe('/one#anchor');
});

test('an unrelated element update does not overwrite external history', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <p>page two</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  window.history.replaceState({}, '', '/two?tab=external#external');
  await act(async () => {
    await controls.get('a')!.merge({ sidebar: 'updated' });
    await flush();
  });
  expect(view.querySelector('[data-sidebar]')?.textContent).toBe('updated');
  expect(window.location.search + window.location.hash).toBe(
    '?tab=external#external',
  );
});

test('an origin action response cannot replace a pending destination', async () => {
  const action = defer<Elements>();
  const navigation = defer<Elements>();
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(action.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = unstable_callServerRsc('actions#action', []);
    await flush();
  });
  mocks.queue.push(navigation.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.get('a')!.router.push('/two');
    await flush();
  });
  await act(async () => {
    action.resolve({
      ...payload('/one', <p>stale action</p>),
      [IS_ORIGIN_ID]: true,
      _value: 7,
    });
    expect(await result).toBe(7);
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.textContent).not.toContain('stale action');
  await act(async () => {
    navigation.resolve(payload('/two', <p>page two</p>));
    await pushed;
    await flush();
  });
  expect(view.textContent).toContain('page two');
  expect(window.location.pathname).toBe('/two');
});

test('a superseded commit cannot install its layout while the next request waits', async () => {
  const push = vi.spyOn(window.history, 'pushState');
  const ready = defer<void>();
  const next = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>cancelled page</p>;
  };
  const layout = (path: string, body: ReactNode) => ({
    ...payload(path, body),
    root: (
      <>
        <Probe id="a" />
        <aside>layout {path}</aside>
        <Children />
      </>
    ),
  });
  mocks.queue.push(layout('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(layout('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  mocks.queue.push(next.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    window.history.replaceState({}, '', '/one?tab=external#external');
    pushed = controls.get('a')!.router.push('/three');
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.querySelector('aside')?.textContent).toBe('layout /one');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname).toBe('/one');
  expect(window.location.search + window.location.hash).toBe(
    '?tab=external#external',
  );
  expect(push).not.toHaveBeenCalled();
  await act(async () => {
    next.resolve(layout('/three', <p>page three</p>));
    await pushed;
    await flush();
  });
  expect(view.querySelector('aside')?.textContent).toBe('layout /three');
  expect(view.querySelector('output')?.textContent).toBe('/three');
  expect(push).toHaveBeenCalledTimes(1);
});

test('a failed replacement cannot reveal the superseded layout', async () => {
  const ready = defer<void>();
  const next = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>cancelled page</p>;
  };
  const layout = (path: string, body: ReactNode) => ({
    ...payload(path, body),
    root: (
      <>
        <Probe id="a" />
        <aside>layout {path}</aside>
        <ErrorBoundary>
          <Children />
        </ErrorBoundary>
      </>
    ),
  });
  mocks.queue.push(layout('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(layout('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  mocks.queue.push(next.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.get('a')!.router.push('/three');
    void pushed.catch(() => {});
    await flush();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => {
    next.reject(new Error('offline'));
    await expect(pushed).rejects.toThrow('offline');
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.querySelector('aside')?.textContent).toBe('layout /one');
  expect(window.location.pathname).toBe('/three');
});

test.each(['external redirect', 'fetch failure'] as const)(
  'a superseded %s returned by load does not affect the pending navigation',
  async (failure) => {
    const push = vi.spyOn(window.history, 'pushState');
    const leave = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    if (failure === 'fetch failure') {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockRejectedValueOnce(new TypeError('offline'))
          .mockResolvedValue(new Response('{}')),
      );
    }
    const next = defer<Elements>();
    mocks.queue.push({ _location: 'https://other.example/redirected' });
    mocks.queue.push(next.promise);
    const load = loader.load;
    let outcomeType: string | undefined;
    let abortedAtResolution: boolean | undefined;
    let signal: AbortSignal | undefined;
    let replacement!: Promise<void>;
    vi.spyOn(loader, 'load').mockImplementationOnce((...args) =>
      load(...args).then((outcome) => {
        outcomeType = outcome.type;
        signal = args[2].signal;
        abortedAtResolution = signal.aborted;
        replacement = controls.get('a')!.router.push('/three');
        return outcome;
      }),
    );
    let cancelledResult: 'fulfilled' | 'rejected' | undefined;
    await act(async () => {
      cancelledResult = await controls
        .get('a')!
        .router.push('/two')
        .then(
          () => 'fulfilled' as const,
          () => 'rejected' as const,
        );
      await flush();
    });
    expect(outcomeType).toBe(
      failure === 'external redirect' ? 'external' : 'failed',
    );
    expect(abortedAtResolution).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(cancelledResult).toBe('fulfilled');
    expect(view.textContent).toContain('page one');
    expect(view.querySelector('output')?.textContent).toBe('/one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      next.resolve(payload('/three', <p>page three</p>));
      await replacement;
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('output')?.textContent).toBe('/three');
    expect(window.location.pathname).toBe('/three');
    expect(push).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  },
);

test('a successful navigation clears the previously committed not-found error', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const missing = defer<Elements>();
  mocks.queue.push(missing.promise);
  let failed!: Promise<void>;
  await act(async () => {
    failed = controls.get('a')!.router.push('/missing');
    void failed.catch(() => {});
    await flush();
  });
  await act(async () => {
    missing.reject(createCustomError('missing', { status: 404 }));
    await expect(failed).rejects.toThrow('missing');
    await flush();
  });
  expect(view.querySelector('h1')?.textContent).toBe('Not Found');
  expect(window.location.pathname).toBe('/missing');
  mocks.queue.push(payload('/two', <p>recovered page</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.textContent).toContain('recovered page');
  expect(view.querySelector('output')?.textContent).toBe('/two');
  expect(view.querySelector('h1')).toBeNull();
  expect(window.location.pathname).toBe('/two');
});

test('an instant paint preserves an earlier queued update when the response omits its slot', async () => {
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <aside data-queued>
          <Suspense fallback="waiting">
            <Slot id="sidebar" />
          </Suspense>
        </aside>
        <Children />
      </>
    ),
    sidebar: 'before',
    [getRouteSlotId('/two')]: <p>cached page two</p>,
    _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const update = defer<Elements>();
  const response = defer<Elements>();
  let merged!: Promise<Elements>;
  let pushed!: Promise<void>;
  await act(async () => {
    merged = controls.get('a')!.merge(update.promise);
    mocks.queue.push(response.promise);
    pushed = controls.get('a')!.router.push('/two', { unstable_instant: true });
    await flush();
  });
  await act(async () => {
    update.resolve({ sidebar: 'queued update' });
    await merged;
    await flush();
  });
  await act(async () => {
    response.resolve({ [ROUTE_ID]: ['/two', ''], [IS_STATIC_ID]: false });
    await pushed;
    await flush();
  });
  expect(view.querySelector('[data-queued]')?.textContent).toBe(
    'queued update',
  );
  expect(view.textContent).toContain('cached page two');
  expect(window.location.pathname).toBe('/two');
});

test('concurrent Routers keep their navigation snapshots independent', async () => {
  mocks.queue.push(payload('/one', <p>first root</p>, 'a'));
  mocks.queue.push(payload('/other', <p>second root</p>, 'b'));
  const view = await mount(
    <>
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />
      <Router initialRoute={{ path: '/other', query: '', hash: '' }} />
    </>,
  );
  mocks.queue.push(payload('/two', <p>first moved</p>, 'a'));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.querySelector('[data-route="a"]')?.textContent).toBe('/two');
  expect(view.querySelector('[data-route="b"]')?.textContent).toBe('/other');
  expect(view.textContent).toContain('second root');
});
