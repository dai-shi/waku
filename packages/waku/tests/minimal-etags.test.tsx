// @vitest-environment happy-dom

// Proves the per-slot cache-validator carry/replay lives in the minimal layer
// (router-agnostic), driving the real minimal Root.
import { Suspense, act, useEffect } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ETAGS_HEADER,
  ETAGS_ID,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../src/lib/utils/etags.js';
import {
  adoptElements,
  collectEtags,
} from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import { getDefaultRootStore } from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  unstable_fetchRsc as fetchRsc,
  unstable_isImmutableElement as isImmutableElement,
  useMergeElements_UNSTABLE,
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

const useRefetch = () => {
  const mergeElements = useMergeElements_UNSTABLE();
  return (
    rscPath: string,
    rscParams?: unknown,
    options?: Parameters<typeof mergeElements>[1],
  ) =>
    mergeElements(
      fetchRsc(rscPath, rscParams, {
        ...(options?.unstable_swr?.base
          ? { unstable_base: options.unstable_swr.base }
          : {}),
      }),
      options,
    );
};

type Refetch = ReturnType<typeof useRefetch>;

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
        unstable_filter: (key) => key === 'page',
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
      unstable_filter: () => false,
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

  it('keeps a static slot painted and tagged through an instant-nav merge', async () => {
    testHoisted.elements = {
      page: <div>a</div>,
      [ETAGS_ID]: { page: IMMUTABLE_ETAG },
    };
    let refetch!: Refetch;
    const Capture = () => {
      const refetchValue = useRefetch();
      useEffect(() => {
        refetch = refetchValue;
      });
      return null;
    };
    const view = await renderApp(
      <Root initialRscPath="R/foo">
        <Suspense fallback="L">
          <Slot id="page" />
        </Suspense>
        <Capture />
      </Root>,
    );
    await flush();
    expect(view.container.textContent).toBe('a');

    const response = Promise.withResolvers<Response>();
    vi.mocked(globalThis.fetch).mockReturnValueOnce(response.promise);
    let refetched: Promise<unknown> | undefined;
    await act(async () => {
      refetched = refetch('R/bar', undefined, {
        unstable_swr: { pin: (key) => key === 'page' },
      });
    });
    expect(view.container.textContent).toBe('a');

    testHoisted.elements = {
      page: <div>b</div>,
      [ETAGS_ID]: { page: IMMUTABLE_ETAG },
    };
    await act(async () => {
      response.resolve(new Response(null, { status: 200 }));
      await refetched;
    });
    await flush();

    expect(view.container.textContent).toBe('a');
    expect(getDefaultRootStore()?.etags.page).toBe(IMMUTABLE_ETAG);

    view.unmount();
  });

  it("sends a base's etags with the request it accompanies", async () => {
    // Statics served from an incomplete prefetch must ride the request as
    // etags, so the server skips re-rendering and re-sending them.
    testHoisted.elements = {
      page: <div>a</div>,
      [ETAGS_ID]: { page: 'etag-page' },
    };
    let refetch!: Refetch;
    const Capture = () => {
      const refetchValue = useRefetch();
      useEffect(() => {
        refetch = refetchValue;
      });
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
          base: adoptElements({
            widget: <div>w</div>,
            [ETAGS_ID]: { widget: 'etag-widget', page: 'etag-page-2' },
            page: <div>p</div>,
          }),
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

  it('caches the etag of a slot a response newly introduces in an instant-nav merge', async () => {
    // A slot only the response introduces lands via the second swr commit,
    // and its etag must enter the cache like any other.
    testHoisted.elements = {
      page: <div>a</div>,
      [ETAGS_ID]: { page: IMMUTABLE_ETAG },
    };
    let refetch!: Refetch;
    const Capture = () => {
      const refetchValue = useRefetch();
      useEffect(() => {
        refetch = refetchValue;
      });
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
      [ETAGS_ID]: { page: IMMUTABLE_ETAG, widget: 'etag-widget' },
      widget: <div>w</div>,
    };
    await act(async () => {
      await refetch('R/bar', undefined, {
        unstable_swr: { pin: (key) => key === 'page' },
      });
    });
    await flush();

    expect(getDefaultRootStore()?.etags.widget).toBe('etag-widget');
    expect(getDefaultRootStore()?.etags.page).toBe(IMMUTABLE_ETAG);

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
