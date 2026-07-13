// @vitest-environment happy-dom

// Proves the per-slot cache-validator carry/replay lives in the minimal layer
// (router-agnostic), driving the real minimal Root.
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ETAGS_HEADER,
  ETAG_ID_PREFIX,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../src/lib/utils/etags.js';
import {
  CACHED_ETAGS,
  ENTRY,
  FETCH_ENHANCERS,
  SET_ELEMENTS,
  fetchRscStore,
} from '../src/minimal/client-utils/fetch-store.js';
import {
  Root,
  unstable_isImmutableElement as isImmutableElement,
  unstable_prefetchRsc as prefetchRsc,
  useRefetch,
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
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 200 }),
  );
  delete fetchRscStore[ENTRY];
  delete fetchRscStore[SET_ELEMENTS];
  delete fetchRscStore[FETCH_ENHANCERS];
  delete fetchRscStore[CACHED_ETAGS];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('minimal per-slot cache-validator (carry + replay)', () => {
  it('caches header-safe tags from a response and drops the clear/non-Latin1 ones', async () => {
    testHoisted.elements = {
      page: <div>page</div>,
      [`${ETAG_ID_PREFIX}page`]: 'etag-foo',
      [`${ETAG_ID_PREFIX}bar`]: 'etag-bar',
      // numeric sentinel-style tag (opaque to minimal) is carried
      [`${ETAG_ID_PREFIX}static`]: 1,
      // empty string is the server's "clear" signal -> dropped
      [`${ETAG_ID_PREFIX}cleared`]: '',
      // non-Latin1 cannot ride in a header -> dropped
      [`${ETAG_ID_PREFIX}nonLatin1`]: 'tag-☃',
    };

    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <div>child</div>
      </Root>,
    );
    await flush();

    const cached = fetchRscStore[CACHED_ETAGS] ?? {};
    expect(cached.page).toBe('etag-foo');
    expect(cached.bar).toBe('etag-bar');
    expect(cached.static).toBe(1);
    expect('cleared' in cached).toBe(false);
    expect('nonLatin1' in cached).toBe(false);

    view.unmount();
  });

  it('isImmutableElement detects the immutable sentinel by tag', () => {
    const elements = {
      [`${ETAG_ID_PREFIX}static`]: IMMUTABLE_ETAG,
      [`${ETAG_ID_PREFIX}dynamic`]: 'v1',
    };
    expect(isImmutableElement(elements, 'static')).toBe(true);
    expect(isImmutableElement(elements, 'dynamic')).toBe(false);
    expect(isImmutableElement(elements, 'missing')).toBe(false);
  });

  it('keeps a static slot etag eager through an instant-nav merge', async () => {
    testHoisted.elements = {
      page: <div>a</div>,
      [`${ETAG_ID_PREFIX}page`]: IMMUTABLE_ETAG,
    };
    let refetch!: ReturnType<typeof useRefetch>;
    const Capture = () => {
      refetch = useRefetch();
      return null;
    };
    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <Capture />
      </Root>,
    );
    await flush();

    // an instant nav: a fresh fetch, with the static slot marked eager
    testHoisted.elements = {
      page: <div>b</div>,
      [`${ETAG_ID_PREFIX}page`]: IMMUTABLE_ETAG,
    };
    await act(async () => {
      await refetch('R/bar', undefined, {
        unstable_swr: { pin: (key) => key === 'page' },
      });
    });
    await flush();

    // the _etag: key follows its slot's swr-ness through the eager merge, so a
    // pinned static slot's etag stays a concrete value and survives in the cache
    expect(fetchRscStore[CACHED_ETAGS]?.page).toBe(IMMUTABLE_ETAG);

    view.unmount();
  });

  it("sends a base's etags with the request it accompanies", async () => {
    // Statics served from an incomplete prefetch must ride the request as
    // etags, so the server skips re-rendering and re-sending them.
    testHoisted.elements = {
      page: <div>a</div>,
      [`${ETAG_ID_PREFIX}page`]: 'etag-page',
    };
    let refetch!: ReturnType<typeof useRefetch>;
    const Capture = () => {
      refetch = useRefetch();
      return null;
    };
    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <Capture />
      </Root>,
    );
    await flush();

    testHoisted.elements = { page: <div>b</div> };
    await act(async () => {
      await refetch('R/bar', undefined, {
        unstable_swr: {
          pin: () => false,
          base: {
            widget: <div>w</div>,
            [`${ETAG_ID_PREFIX}widget`]: 'etag-widget',
            page: <div>p</div>,
            [`${ETAG_ID_PREFIX}page`]: 'etag-page-2',
          },
        },
      });
    });

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    const sent = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
    expect(sent.widget).toBe('etag-widget');
    // for a key the base holds, the base's etag is claimed: an omission then
    // proves the base copy current, and the merge falls back to it
    expect(sent.page).toBe('etag-page-2');

    view.unmount();
  });

  it('a prefetch without a base claims nothing', async () => {
    fetchRscStore[CACHED_ETAGS] = { widget: 'etag-live' };
    testHoisted.elements = { page: <div>b</div> };
    await prefetchRsc('R/bar');

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    expect(JSON.parse(headers.get(ETAGS_HEADER) ?? 'null')).toEqual({});
  });

  it('a prefetch claims the etags of its base and returns the merge', async () => {
    fetchRscStore[CACHED_ETAGS] = { widget: 'etag-live', page: 'etag-page' };
    testHoisted.elements = {
      page: <div>b</div>,
      [`${ETAG_ID_PREFIX}page`]: 'etag-page-2',
    };
    const result = await prefetchRsc('R/bar', undefined, {
      unstable_base: {
        widget: <div>w</div>,
        [`${ETAG_ID_PREFIX}widget`]: 'etag-widget',
      },
    });

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    const sent = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
    // only the base's etags are claimed: a live copy the prefetch does not
    // retain must not let the server omit an element
    expect(sent.widget).toBe('etag-widget');
    expect(sent.page).toBeUndefined();

    // a key the response omits is kept from the base, with its etag: a
    // caller cannot claim copies it does not keep
    expect(result.widget).toBeDefined();
    expect(result[`${ETAG_ID_PREFIX}widget`]).toBe('etag-widget');
    expect(result[`${ETAG_ID_PREFIX}page`]).toBe('etag-page-2');
  });

  it('caches the etag of a slot a response newly introduces in an instant-nav merge', async () => {
    // A slot only the response introduces lands via the second swr commit,
    // and its etag must enter the cache like any other.
    testHoisted.elements = {
      page: <div>a</div>,
      [`${ETAG_ID_PREFIX}page`]: IMMUTABLE_ETAG,
    };
    let refetch!: ReturnType<typeof useRefetch>;
    const Capture = () => {
      refetch = useRefetch();
      return null;
    };
    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <Capture />
      </Root>,
    );
    await flush();

    testHoisted.elements = {
      page: <div>b</div>,
      [`${ETAG_ID_PREFIX}page`]: IMMUTABLE_ETAG,
      widget: <div>w</div>,
      [`${ETAG_ID_PREFIX}widget`]: 'etag-widget',
    };
    await act(async () => {
      await refetch('R/bar', undefined, {
        unstable_swr: { pin: (key) => key === 'page' },
      });
    });
    await flush();

    expect(fetchRscStore[CACHED_ETAGS]?.widget).toBe('etag-widget');
    expect(fetchRscStore[CACHED_ETAGS]?.page).toBe(IMMUTABLE_ETAG);

    view.unmount();
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
