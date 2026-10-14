// @vitest-environment happy-dom

import { Suspense, act, useEffect } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ETAGS_HEADER,
  ETAGS_ID,
  IMMUTABLE_ETAG,
} from '../src/lib/utils-isomorphic/etags.js';
import { adoptElements } from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import { getDefaultRootStore } from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useFetchRsc_UNSTABLE,
} from '../src/minimal/client.js';
import { useMergeInstantElements } from '../src/router/client-utils/instant-elements.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

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
  const fetchRsc = useFetchRsc_UNSTABLE();
  const mergeInstantElements = useMergeInstantElements();
  return (
    rscPath: string,
    rscParams: unknown,
    pin: (key: string | symbol) => boolean,
    base?: Elements,
    overlay?: Elements,
  ) =>
    mergeInstantElements(
      fetchRsc(rscPath, rscParams, base ? { unstable_base: base } : undefined),
      pin,
      base,
      overlay,
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
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 200 }),
  );
  clearInitialRscEntries();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearInitialRscEntries();
});
describe('instant element etags', () => {
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
      refetched = refetch('R/bar', undefined, (key) => key === 'page');
    });
    expect(view.container.textContent).toBe('a');

    testHoisted.elements = {
      page: <div>a</div>,
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
      await refetch(
        'R/bar',
        undefined,
        () => false,
        adoptElements({
          widget: <div>w</div>,
          [ETAGS_ID]: { widget: 'etag-widget', page: 'etag-page-2' },
          page: <div>p</div>,
        }),
      );
    });

    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const headers = new Headers(
      (lastCall?.[1] as RequestInit | undefined)?.headers,
    );
    const sent = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
    expect(sent.widget).toBe('etag-widget');
    expect(sent.page).toBe('etag-page-2');

    view.unmount();
  });

  it('caches the etag of a slot a response newly introduces in an instant-nav merge', async () => {
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
      page: <div>a</div>,
      [ETAGS_ID]: { page: IMMUTABLE_ETAG, widget: 'etag-widget' },
      widget: <div>w</div>,
    };
    await act(async () => {
      await refetch('R/bar', undefined, (key) => key === 'page');
    });
    await flush();

    expect(getDefaultRootStore()?.etags.widget).toBe('etag-widget');
    expect(getDefaultRootStore()?.etags.page).toBe(IMMUTABLE_ETAG);

    view.unmount();
  });
});
