import type { ReactNode } from 'react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ETAG_ID_PREFIX,
  SKIP_HEADER,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/common.js';
import { unstable_defineRouter } from '../src/router/define-router.js';

vi.mock('../src/server.js', () => ({
  // Static slots round-trip through serialize/deserialize; for these tests the
  // identity of the deserialized element does not matter, only its presence.
  deserializeRsc: vi.fn().mockResolvedValue('static-element'),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

type Option = { routePath: string; query: string | undefined };

type ElementSpec = {
  isStatic: boolean;
  renderer: (option: Option) => ReactNode;
  getEtagFromOption?: (option: Option) => Promise<string | undefined>;
};

const buildRouter = (elements: Record<string, ElementSpec>) =>
  unstable_defineRouter({
    getConfigs: async () => [
      {
        type: 'route' as const,
        path: [{ type: 'literal' as const, name: 'foo' }],
        isStatic: false,
        rootElement: { isStatic: false, renderer: () => 'root' },
        routeElement: { isStatic: false, renderer: () => 'route' },
        elements,
      },
    ],
  });

// Drive a single RSC ("component") request and capture the entries record that
// the router hands to renderRsc, so we can assert which slots were sent.
const drive = async (
  router: ReturnType<typeof unstable_defineRouter>,
  headers: Record<string, string>,
  rscPath = encodeRoutePath('/foo'),
): Promise<Record<string, unknown>> => {
  let captured: Record<string, unknown> = {};
  await router.handleRequest(
    {
      type: 'component',
      pathname: '/foo',
      rscPath,
      rscParams: undefined,
      req: new Request('http://localhost/foo', { headers }),
    },
    {
      renderRsc: vi.fn(async (entries: unknown) => {
        captured = entries as Record<string, unknown>;
        return makeStream();
      }),
      parseRsc: vi.fn(),
      renderHtml: vi.fn(),
      loadBuildMetadata: vi.fn(),
    },
  );
  return captured;
};

const getEntries = (
  router: ReturnType<typeof unstable_defineRouter>,
  clientEtags?: Record<string, string>,
): Promise<Record<string, unknown>> =>
  drive(
    router,
    clientEtags ? { [SKIP_HEADER]: JSON.stringify(clientEtags) } : {},
  );

// Drive with a raw, un-serialized skip header (for legacy/malformed inputs).
const getEntriesWithSkipHeader = (
  router: ReturnType<typeof unstable_defineRouter>,
  skipHeader: string,
): Promise<Record<string, unknown>> =>
  drive(router, { [SKIP_HEADER]: skipHeader });

const etagKey = (slotId: string) => `${ETAG_ID_PREFIX}${slotId}`;

describe('define-router etags (element tag skip)', () => {
  it('sends a dynamic slot with its etag when the client has none', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => 'v1',
      },
    });

    const entries = await getEntries(router);
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('v1');
  });

  it('omits a dynamic slot when the client etag still matches', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => 'v1',
      },
    });

    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(false);
    expect(etagKey('page') in entries).toBe(false);
  });

  it('re-sends a dynamic slot with the new etag when it changed', async () => {
    let tag = 'v1';
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => tag,
      },
    });

    // The tag changed (e.g. after an invalidation) -> getEtag returns it.
    tag = 'v2';
    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('v2');
  });

  it('always sends a dynamic slot without a getEtag (no etag carried)', async () => {
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
      },
    });

    const entries = await getEntries(router);
    expect('page' in entries).toBe(true);
    expect(etagKey('page') in entries).toBe(false);
  });

  it('clears a stale etag when a dynamic slot no longer provides one', async () => {
    let tag: string | undefined = 'v1';
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div', null, 'page'),
        getEtagFromOption: async () => tag,
      },
    });

    // The slot drops its tag; the client still holds 'v1', so the slot is sent
    // with an empty tag to clear it.
    tag = undefined;
    const entries = await getEntries(router, { page: 'v1' });
    expect('page' in entries).toBe(true);
    expect(entries[etagKey('page')]).toBe('');
  });

  it('uses the constant "static" etag for static slots and omits on match', async () => {
    const router = buildRouter({
      page: { isStatic: true, renderer: () => createElement('div') },
    });

    const first = await getEntries(router);
    expect('page' in first).toBe(true);
    expect(first[etagKey('page')]).toBe('static');

    const second = await getEntries(router, { page: 'static' });
    expect('page' in second).toBe(false);
    expect(etagKey('page') in second).toBe(false);
  });

  it('ignores a getEtag on a static slot (tag stays "static")', async () => {
    const router = buildRouter({
      page: {
        isStatic: true,
        renderer: () => createElement('div'),
        getEtagFromOption: async () => 'should-be-ignored',
      },
    });

    const entries = await getEntries(router);
    expect(entries[etagKey('page')]).toBe('static');
  });

  it('passes the element option to getEtag', async () => {
    const seen: unknown[] = [];
    const router = buildRouter({
      page: {
        isStatic: false,
        renderer: () => createElement('div'),
        getEtagFromOption: async (option) => {
          seen.push(option);
          return 'v1';
        },
      },
    });

    await getEntries(router);
    expect(seen).toContainEqual(expect.objectContaining({ routePath: '/foo' }));
  });

  it('applies the same etag skip to a dynamic slice', async () => {
    let sliceTag = 'sv1';
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'foo' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
          slices: ['mySlice'],
        },
        {
          type: 'slice' as const,
          id: 'mySlice',
          isStatic: false,
          renderer: async () => createElement('div', null, 'slice'),
          getEtagFromParams: async () => sliceTag,
        },
      ],
    });
    const slot = 'slice:mySlice';

    const first = await getEntries(router);
    expect(slot in first).toBe(true);
    expect(first[etagKey(slot)]).toBe('sv1');

    const omitted = await getEntries(router, { [slot]: 'sv1' });
    expect(slot in omitted).toBe(false);

    // Slice invalidated -> tag changed -> re-sent.
    sliceTag = 'sv2';
    const resent = await getEntries(router, { [slot]: 'sv1' });
    expect(slot in resent).toBe(true);
    expect(resent[etagKey(slot)]).toBe('sv2');
  });

  it('resolves the etag before rendering on a slice request, so a concurrent invalidation cannot tag stale content', async () => {
    const calls: string[] = [];
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'slice' as const,
          id: 'mySlice',
          isStatic: false,
          renderer: async () => {
            calls.push('render');
            return createElement('div', null, 'slice');
          },
          getEtagFromParams: async () => {
            calls.push('etag');
            return 'sv1';
          },
        },
      ],
    });

    await drive(router, {}, encodeSliceId('mySlice'));
    expect(calls).toEqual(['etag', 'render']);
  });

  it('applies the etag skip to the root element', async () => {
    let tag = 'r1';
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'foo' }],
          isStatic: false,
          rootElement: {
            isStatic: false,
            renderer: () => 'root',
            getEtagFromOption: async () => tag,
          },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
    });

    const first = await getEntries(router);
    expect('root' in first).toBe(true);
    expect(first[etagKey('root')]).toBe('r1');

    const omitted = await getEntries(router, { root: 'r1' });
    expect('root' in omitted).toBe(false);

    // Root invalidated -> tag changed -> re-sent.
    tag = 'r2';
    const resent = await getEntries(router, { root: 'r1' });
    expect('root' in resent).toBe(true);
    expect(resent[etagKey('root')]).toBe('r2');
  });

  it('resolves each slot independently in one response', async () => {
    let pageTag: string | undefined = 'p1';
    let sliceTag: string | undefined = 's1';
    const router = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'foo' }],
          isStatic: false,
          rootElement: {
            isStatic: false,
            renderer: () => 'root',
            getEtagFromOption: async () => 'r1',
          },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {
            page: {
              isStatic: false,
              renderer: () => createElement('div', null, 'page'),
              getEtagFromOption: async () => pageTag,
            },
          },
          slices: ['mySlice'],
        },
        {
          type: 'slice' as const,
          id: 'mySlice',
          isStatic: false,
          renderer: async () => createElement('div', null, 'slice'),
          getEtagFromParams: async () => sliceTag,
        },
      ],
    });

    // root unchanged, page changed, slice loses its tag.
    pageTag = 'p2';
    sliceTag = undefined;
    const entries = await getEntries(router, {
      root: 'r1',
      page: 'p1',
      'slice:mySlice': 's1',
    });

    expect('root' in entries).toBe(false); // unchanged -> omitted
    expect(entries.page).toBeDefined(); // changed -> re-sent
    expect(entries[etagKey('page')]).toBe('p2');
    expect(entries['slice:mySlice']).toBeDefined(); // lost tag -> re-sent
    expect(entries[etagKey('slice:mySlice')]).toBe(''); // cleared
  });

  it('ignores a legacy, malformed, or non-string skip header', async () => {
    const build = () =>
      buildRouter({
        page: { isStatic: true, renderer: () => createElement('div') },
      });

    // A valid map would skip the static slot; these never do.
    for (const header of [
      JSON.stringify(['page']), // legacy array of ids
      'not json',
      JSON.stringify({ page: 123 }), // non-string value
    ]) {
      const entries = await getEntriesWithSkipHeader(build(), header);
      expect('page' in entries).toBe(true);
      expect(entries[etagKey('page')]).toBe('static');
    }
  });
});
