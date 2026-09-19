// @vitest-environment happy-dom

import { Suspense, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_HEADER, ETAGS_ID } from '../src/lib/utils/etags.js';
import { adoptElements } from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import type {
  RequestRsc,
  RequestRscEnhancer,
} from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_callServerRsc as callServerRsc,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from '../src/minimal/client.js';

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: async (response: Promise<Response>) =>
      (await response).json(),
    encodeReply: async (value: unknown) => JSON.stringify(value),
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const roots: ReturnType<typeof createRoot>[] = [];
const request = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', request);
  request.mockReset();
  request.mockImplementation(async () => Response.json({ content: 'initial' }));
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  clearInitialRscEntries();
  Reflect.deleteProperty(import.meta, 'hot');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const mount = async (path: string) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  let api: {
    fetch: ReturnType<typeof useFetchRsc>;
    register: ReturnType<typeof useRegisterRscEnhancer>;
    merge: ReturnType<typeof useMergeElements>;
    elements: ReturnType<typeof useElementsPromise>;
  };
  const Probe = () => {
    const fetch = useFetchRsc();
    const register = useRegisterRscEnhancer();
    const merge = useMergeElements();
    const elements = useElementsPromise();
    useEffect(() => {
      api = { fetch, register, merge, elements };
    });
    return <Slot id="content" />;
  };
  await act(async () => {
    root.render(
      <Suspense fallback="pending">
        <Root initialRscPath={path}>
          <Probe />
        </Root>
      </Suspense>,
    );
  });
  expect(container.textContent).toBe('initial');
  return { ...api!, container, root, getElements: () => api.elements };
};

test('a whole cached response applies to the request-time Root', async () => {
  const first = await mount('first');
  let cached: ReturnType<RequestRsc> | undefined;
  const cache: RequestRscEnhancer =
    (next) =>
    (...args) =>
      (cached ??= next(...args));
  first.register(cache);
  request.mockImplementation(async () =>
    Response.json({ content: 'cached', _value: 'value' }),
  );
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('value');
  });
  expect(first.container.textContent).toBe('cached');
  request.mockImplementation(async () => Response.json({ content: 'initial' }));
  const second = await mount('second');
  second.register(cache);
  request.mockClear();
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('value');
  });
  expect(request).not.toHaveBeenCalled();
  expect(second.container.textContent).toBe('cached');
});

test('composes logical inputs, transport, and decoded elements', async () => {
  const root = await mount('initial');
  const order: string[] = [];
  root.register((next) => async (path, params, options) => {
    order.push('first');
    expect(options.type).toBe('rsc');
    const { elements, value } = await next(path + '-first', params, {
      ...options,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('scoped', 'yes');
        const response = await options.fetch(input, { ...init, headers });
        return new Response(
          (await response.text()).replace('server', 'raw'),
          response,
        );
      },
    });
    order.push('first result');
    return {
      elements: { ...elements, content: elements.content + '-decoded' },
      value,
    };
  });
  const unregister = root.register((next) => async (path, params, options) => {
    order.push('second');
    const result = await next(path, { input: params }, options);
    order.push('second result');
    return result;
  });
  const controller = new AbortController();
  request.mockImplementation(async () => Response.json({ content: 'server' }));
  const data = await root.fetch(
    'next',
    { count: 1 },
    { signal: controller.signal },
  );
  expect(data.content).toBe('raw-decoded');
  expect(order).toEqual(['second', 'first', 'first result', 'second result']);
  const [url, init] = request.mock.lastCall!;
  expect(url).toContain('/next-first');
  expect(JSON.parse(init!.body as string)).toEqual({ input: { count: 1 } });
  expect(init?.signal).toBe(controller.signal);
  expect(request.mock.contexts.at(-1)).toBe(globalThis);
  expect(new Headers(init?.headers).get('scoped')).toBe('yes');
  expect(root.container.textContent).toBe('initial');
  await act(async () => {
    await root.merge(data);
  });
  expect(root.container.textContent).toBe('raw-decoded');
  unregister();
  order.length = 0;
  await root.fetch('next');
  expect(order).toEqual(['first', 'first result']);
});

test('Root-bound requests stay isolated and actions keep their request-time enhancer chain', async () => {
  const first = await mount('first');
  const second = await mount('second');
  const firstEnhancer = vi.fn((path: string) => path + '-first');
  first.register(
    (next) => (path, params, options) =>
      next(firstEnhancer(path), params, options),
  );
  const actionTypes: string[] = [];
  const unregister = second.register(
    (next) => async (path, params, options) => {
      actionTypes.push(options.type);
      const { elements, value } = await next(path + '-second', params, options);
      return {
        elements: { ...elements, content: elements.content + '-second' },
        value,
      };
    },
  );
  await first.fetch('scoped');
  expect(request.mock.lastCall![0]).toContain('scoped-first');
  expect(actionTypes).toEqual([]);
  let respond!: (response: Response) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const action = callServerRsc('file#action', []);
  unregister();
  await act(async () => second.root.unmount());
  await act(async () => {
    respond(Response.json({ _value: 42, content: 'action' }));
    expect(await action).toBe(42);
  });
  expect(actionTypes).toEqual(['call']);
  expect(first.container.textContent).toBe('initial');
  expect(firstEnhancer).toHaveBeenCalledTimes(1);
});

test('filtering action elements preserves the return value and Minimal build checks', async () => {
  const root = await mount('initial');
  root.register((next) => async (...args) => {
    const { elements, value } = await next(...args);
    expect(elements).not.toHaveProperty('_value');
    return { elements: {}, value };
  });
  request.mockImplementation(async () =>
    Response.json({ _value: 'result', content: 'changed' }),
  );
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('result');
  });
  expect(root.container.textContent).toBe('initial');
  vi.stubEnv('WAKU_BUILD_ID', 'current');
  request.mockImplementation(async () => Response.json({ _buildId: 'old' }));
  const mismatch = vi.fn();
  expect(
    await root.fetch('next', undefined, { onBuildIdMismatch: mismatch }),
  ).toEqual({});
  expect(mismatch).toHaveBeenCalledOnce();
  request.mockImplementation(async () =>
    Response.json({ _location: '/elsewhere' }),
  );
  await expect(root.fetch('next')).rejects.toThrow('document navigation');
});

test('action enhancers can return only client-owned symbol keys', async () => {
  const root = await mount('initial');
  const key = Symbol();
  root.register((next) => async (...args) => {
    const { value } = await next(...args);
    return { elements: { [key]: 'updated' }, value };
  });
  await act(async () => {
    await callServerRsc('file#action', []);
  });
  expect((await root.getElements())[key]).toBe('updated');
});

test('Root-bound fetches only claim validators from an explicit base', async () => {
  const root = await mount('initial');
  const base = adoptElements({
    content: 'retained',
    [ETAGS_ID]: { content: 'version' },
  });
  await act(async () => {
    await root.merge(base);
  });
  request.mockImplementation(async () => Response.json({}));
  await root.fetch('next');
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ETAGS_HEADER),
  ).toBe('{}');
  expect(await root.fetch('next', undefined, { unstable_base: base })).toEqual(
    base,
  );
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ETAGS_HEADER),
  ).toBe('{"content":"version"}');
});

test.each([false, true])(
  'explicit order is independent of registration order: %s',
  async (reverse) => {
    const root = await mount('initial');
    const applied = vi.fn();
    const observe: RequestRscEnhancer =
      (next) =>
      async (...args) => {
        const result = await next(...args);
        if (args[2].type === 'call') {
          applied(result.elements, result.value);
        }
        return result;
      };
    const transform: RequestRscEnhancer =
      (next) =>
      async (...args) => {
        const { elements, value } = await next(...args);
        return {
          elements: { ...elements, content: 'final' },
          value: String(value) + '-final',
        };
      };
    if (reverse) {
      root.register(transform);
      root.register(observe, 1);
    } else {
      root.register(observe, 1);
      root.register(transform);
    }
    request.mockImplementation(async () =>
      Response.json({ content: 'server', _value: 'value' }),
    );
    expect((await root.fetch('next')).content).toBe('final');
    expect(applied).not.toHaveBeenCalled();
    expect(root.container.textContent).toBe('initial');
    await act(async () => {
      expect(await callServerRsc('file#action', [])).toBe('value-final');
    });
    expect(applied).toHaveBeenCalledExactlyOnceWith(
      { content: 'final' },
      'value-final',
    );
    expect(root.container.textContent).toBe('final');
  },
);

test('a development reload keeps only the symbols the enhanced response omits', async () => {
  Object.defineProperty(import.meta, 'hot', { configurable: true, value: {} });
  const RETAINED = Symbol();
  const CLEARED = Symbol();
  const root = await mount('initial');
  let version = 0;
  root.register((next) => async (...args) => {
    const { elements, value } = await next(...args);
    version += 1;
    return {
      elements: {
        ...elements,
        [RETAINED]: 'retained',
        ...(version === 1
          ? { [CLEARED]: 'clear me' }
          : { [CLEARED]: undefined }),
      },
      value,
    };
  });
  request.mockImplementation(async () =>
    Response.json({ content: 'reloaded' }),
  );
  const reload = () =>
    act(async () => {
      (
        globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
      ).__WAKU_RSC_RELOAD_LISTENERS__?.at(-1)?.();
    });

  await reload();
  expect(await root.getElements()).toMatchObject({
    content: 'reloaded',
    [RETAINED]: 'retained',
    [CLEARED]: 'clear me',
  });

  await reload();
  const elements = await root.getElements();
  expect(elements[RETAINED]).toBe('retained');
  expect(CLEARED in elements).toBe(true);
  expect(elements[CLEARED]).toBeUndefined();
});

test('an enhancer that throws rejects the request', async () => {
  const root = await mount('initial');
  const failure = new Error('bad enhancer');
  root.register(() => () => {
    throw failure;
  });

  await expect(root.fetch('next')).rejects.toBe(failure);
});

test('each registration is its own link in the chain', async () => {
  const root = await mount('initial');
  const seen = vi.fn();
  const count: RequestRscEnhancer =
    (next) =>
    (...args) => {
      seen();
      return next(...args);
    };
  const unregister = root.register(count);
  root.register(count);

  await root.fetch('next');
  expect(seen).toHaveBeenCalledTimes(2);

  unregister();
  await root.fetch('next');
  expect(seen).toHaveBeenCalledTimes(3);
});
