// @vitest-environment happy-dom

// Proves the per-slot cache-validator carry/replay lives in the minimal layer
// (router-agnostic), driving the real minimal Root.
import { act, useEffect } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ETAGS_HEADER,
  ETAGS_ID,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../src/lib/utils-isomorphic/etags.js';
import {
  adoptElements,
  collectEtags,
} from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import { getDefaultRootStore } from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  unstable_combineElements as combineElements,
  unstable_isImmutableElement as isImmutableElement,
  unstable_isSameElement as isSameElement,
  useFetchRsc_UNSTABLE,
} from '../src/minimal/client.js';
import { unstable_buildElements as buildElements } from '../src/minimal/server.js';

const testHoisted = vi.hoisted(() => ({
  elements: {} as Record<string, unknown>,
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: vi.fn(async (responsePromise: Promise<Response>) => {
      await responsePromise;
      return testHoisted.elements;
    }),
    encodeReply: vi.fn(async () => ''),
    createTemporaryReferenceSet: vi.fn(() => new Map()),
  },
}));

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve));
  });
};

const renderApp = async (element: ReactElement) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

let fetchRsc: ReturnType<typeof useFetchRsc_UNSTABLE>;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const Probe = () => {
    const rootlessFetch = useFetchRsc_UNSTABLE();
    useEffect(() => {
      fetchRsc = rootlessFetch;
    });
    return null;
  };
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Probe />);
  });
  act(() => root.unmount());
});

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 200 }),
  );
  clearInitialRscEntries();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sentEtags = () => {
  const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const headers = new Headers(
    (lastCall?.[1] as RequestInit | undefined)?.headers,
  );
  return JSON.parse(headers.get(ETAGS_HEADER) ?? 'null');
};

describe('minimal per-slot cache-validator (carry + replay)', () => {
  it('compares slot values with their validators after fetching and combining', async () => {
    testHoisted.elements = { count: 0, [ETAGS_ID]: { count: 'v1' } };
    const first = await fetchRsc('R/foo');
    testHoisted.elements = { count: 0, [ETAGS_ID]: { count: 'v2' } };
    const second = await fetchRsc('R/foo');
    testHoisted.elements = { count: 0 };
    const cleared = await fetchRsc('R/foo');

    expect(isSameElement(first, combineElements({}, first), 'count')).toBe(
      true,
    );
    expect(isSameElement(first, second, 'count')).toBe(false);
    expect(isSameElement(second, cleared, 'count')).toBe(false);
    expect(isSameElement(cleared, { count: 0 }, 'count')).toBe(false);
    expect(
      isSameElement(first, combineElements(first, { count: 1 }), 'count'),
    ).toBe(false);
  });

  it('distinguishes sources with equal values and validators', async () => {
    testHoisted.elements = { count: 0, [ETAGS_ID]: { count: 'v1' } };
    const first = await fetchRsc('R/foo');
    const second = await fetchRsc('R/foo');
    expect(isSameElement(first, second, 'count')).toBe(false);
    expect(isSameElement(first, combineElements({}, first), 'count')).toBe(
      true,
    );
    expect(isSameElement(first, combineElements(first, second), 'count')).toBe(
      false,
    );
  });

  it('compares own slot presence and sources, including client symbols', () => {
    const state = Symbol('state');
    const value = {};
    const elements = {
      [state]: value,
      missing: undefined,
      nan: NaN,
      constructor: value,
    };
    expect(isSameElement({}, {}, 'constructor')).toBe(true);
    expect(isSameElement(elements, {}, 'constructor')).toBe(false);
    expect(isSameElement(elements, {}, 'missing')).toBe(false);
    expect(isSameElement(elements, { [state]: value }, state)).toBe(false);
    expect(isSameElement(elements, combineElements({}, elements), state)).toBe(
      true,
    );
    expect(isSameElement(elements, { [state]: {} }, state)).toBe(false);
    expect(isSameElement(elements, { nan: NaN }, 'nan')).toBe(false);
    expect(isSameElement(elements, combineElements({}, elements), 'nan')).toBe(
      true,
    );
    const copied = combineElements({}, elements);
    elements.nan = 0;
    expect(isSameElement(elements, copied, 'nan')).toBe(false);
  });

  it('caches header-safe tags from a response and drops the clear/non-Latin1 ones', async () => {
    testHoisted.elements = {
      page: <div>page</div>,
      bar: 'bar',
      static: null,
      cleared: <div>cleared</div>,
      nonLatin1: <div>nonLatin1</div>,
      [ETAGS_ID]: {
        page: 'etag-foo',
        bar: 'etag-bar',
        // numeric sentinel-style tag (opaque to minimal) is carried
        static: 1,
        // empty string is the server's "clear" signal -> dropped
        cleared: '',
        // non-Latin1 cannot ride in a header -> dropped
        nonLatin1: 'tag-☃',
      },
    };

    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <div>child</div>
      </Root>,
    );
    await flush();

    const cached = getDefaultRootStore()?.etags ?? {};
    expect(cached.page).toBe('etag-foo');
    expect(cached.bar).toBe('etag-bar');
    expect(cached.static).toBe(1);
    expect('cleared' in cached).toBe(false);
    expect('nonLatin1' in cached).toBe(false);

    view.unmount();
  });

  it('isImmutableElement answers for the record a slot arrived in and its merges', async () => {
    testHoisted.elements = {
      static: null,
      dynamic: <div>dynamic</div>,
      [ETAGS_ID]: { static: IMMUTABLE_ETAG, dynamic: 'v1' },
    };
    const elements = await fetchRsc('R/foo');

    expect(isImmutableElement(elements, 'static')).toBe(true);
    expect(isImmutableElement(elements, 'dynamic')).toBe(false);
    expect(isImmutableElement(elements, 'missing')).toBe(false);
    expect(isImmutableElement(combineElements({}, elements), 'static')).toBe(
      true,
    );
    expect(
      isImmutableElement(
        combineElements(elements, { static: 'other' }),
        'static',
      ),
    ).toBe(false);
  });

  it('a merged record keeps the etags its values arrived with', async () => {
    testHoisted.elements = {
      page: <div>page</div>,
      count: 0,
      [ETAGS_ID]: { page: 'etag-page', count: 'etag-count' },
    };
    const first = await fetchRsc('R/foo');
    testHoisted.elements = {
      side: <div>side</div>,
      [ETAGS_ID]: { side: 'etag-side' },
    };
    const second = await fetchRsc('R/foo');
    testHoisted.elements = {};

    await fetchRsc('R/bar', undefined, {
      unstable_base: combineElements(first, second),
    });
    expect(sentEtags()).toEqual({
      page: 'etag-page',
      count: 'etag-count',
      side: 'etag-side',
    });

    await fetchRsc('R/bar', undefined, {
      unstable_base: combineElements({}, first, {
        filter: (key) => key === 'page',
      }),
    });
    expect(sentEtags()).toEqual({ page: 'etag-page' });
  });

  it('a copy made without combineElements claims nothing', async () => {
    testHoisted.elements = {
      page: <div>page</div>,
      count: 0,
      [ETAGS_ID]: { page: 'etag-page', count: 'etag-count' },
    };
    const elements = await fetchRsc('R/foo');
    testHoisted.elements = {};

    await fetchRsc('R/bar', undefined, { unstable_base: { ...elements } });
    expect(sentEtags()).toEqual({});
  });

  it('a slot sent again without a tag has none, even for an equal value', async () => {
    testHoisted.elements = {
      content: 'same',
      [ETAGS_ID]: { content: IMMUTABLE_ETAG },
    };
    const base = await fetchRsc('R/first');
    testHoisted.elements = { content: 'same' };
    const result = await fetchRsc('R/second', undefined, {
      unstable_base: base,
    });
    testHoisted.elements = {};

    expect(isImmutableElement(result, 'content')).toBe(false);
    await fetchRsc('R/third', undefined, { unstable_base: result });
    expect(sentEtags()).toEqual({});
  });

  it('a record the filter left out cannot lend its tag to a kept value', () => {
    const first = adoptElements({
      content: 'same',
      [ETAGS_ID]: { content: 'v1' },
    });
    const second = adoptElements({
      content: 'same',
      [ETAGS_ID]: { content: IMMUTABLE_ETAG },
    });

    const kept = combineElements(first, second, {
      filter: () => false,
    });

    expect(collectEtags(kept)).toEqual({ content: 'v1' });
  });

  it('two records keep their own claims for one slot', async () => {
    testHoisted.elements = {
      page: <div>x</div>,
      [ETAGS_ID]: { page: 'xxx' },
    };
    const current = await fetchRsc('R/x');
    testHoisted.elements = {
      page: <div>y</div>,
      [ETAGS_ID]: { page: 'yyy' },
    };
    const prefetched = await fetchRsc('R/y');
    testHoisted.elements = {};

    await fetchRsc('R/x', undefined, { unstable_base: current });
    expect(sentEtags()).toEqual({ page: 'xxx' });
    await fetchRsc('R/y', undefined, { unstable_base: prefetched });
    expect(sentEtags()).toEqual({ page: 'yyy' });
  });

  it('a prefetch without a base claims nothing', async () => {
    testHoisted.elements = { page: <div>b</div> };
    await fetchRsc('R/bar');

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    expect(JSON.parse(headers.get(ETAGS_HEADER) ?? 'null')).toEqual({});
  });

  it('a prefetch claims the etags of its base and returns the merge', async () => {
    testHoisted.elements = {
      widget: <div>w</div>,
      [ETAGS_ID]: { widget: 'etag-widget' },
    };
    const base = await fetchRsc('R/base');
    testHoisted.elements = {
      page: <div>b</div>,
      [ETAGS_ID]: { page: 'etag-page-2' },
    };
    const result = await fetchRsc('R/bar', undefined, { unstable_base: base });

    // only the base's etags are claimed: a live copy the prefetch does not
    // retain must not let the server omit an element
    expect(sentEtags()).toEqual({ widget: 'etag-widget' });

    // a key the response omits is kept from the base, with its etag
    testHoisted.elements = {};
    await fetchRsc('R/baz', undefined, { unstable_base: result });
    expect(sentEtags()).toEqual({ widget: 'etag-widget', page: 'etag-page-2' });
  });

  it('sends a non-ASCII slot id in a header a browser accepts', async () => {
    testHoisted.elements = {
      'slice:日本': <div>s</div>,
      [ETAGS_ID]: { 'slice:日本': IMMUTABLE_ETAG },
    };
    const base = await fetchRsc('R/base');
    await fetchRsc('R/bar', undefined, { unstable_base: base });

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    expect(headers.get(ETAGS_HEADER)).toMatch(/^[\x20-\x7e]*$/);
    expect(sentEtags()).toEqual({ 'slice:日本': IMMUTABLE_ETAG });
  });
});

describe('unstable_buildElements', () => {
  it('omits matched slots, attaches/clears tags, and maps immutable to the sentinel', async () => {
    const render = () => Promise.resolve('el');
    const { elements, etags } = await buildElements(
      { match: 'v1', stale: 'old' },
      {
        match: { getEtag: () => Promise.resolve('v1'), render },
        changed: { getEtag: () => Promise.resolve('v2'), render },
        immut: { immutable: true, render },
        stale: { getEtag: () => Promise.resolve(undefined), render },
      },
    );

    expect(Object.keys(elements).sort()).toEqual(['changed', 'immut', 'stale']);
    expect(etags).toEqual({ changed: 'v2', immut: IMMUTABLE_ETAG, stale: '' });
  });

  it('drops empty or invalid getEtag results server-side (no etag, not the clear sentinel)', async () => {
    const render = () => Promise.resolve('el');
    const { elements, etags } = await buildElements(
      {},
      {
        empty: { getEtag: () => Promise.resolve(''), render },
        control: { getEtag: () => Promise.resolve('tag\x7f'), render },
      },
    );

    expect(elements).toEqual({ empty: 'el', control: 'el' });
    expect(etags).toEqual({});
  });
});

describe('isValidEtag', () => {
  it('accepts the sentinel and printable Latin-1, rejects empty, control, and non-Latin1', () => {
    expect(isValidEtag(IMMUTABLE_ETAG)).toBe(true);
    expect(isValidEtag('v1')).toBe(true);
    expect(isValidEtag('café')).toBe(true);
    expect(isValidEtag('')).toBe(false);
    expect(isValidEtag('tag\x7f')).toBe(false);
    expect(isValidEtag('tag\x80')).toBe(false);
    expect(isValidEtag('tag-☃')).toBe(false);
    expect(isValidEtag(123)).toBe(false);
  });
});
