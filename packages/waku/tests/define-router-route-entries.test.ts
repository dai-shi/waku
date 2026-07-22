import { describe, expect, it, vi } from 'vitest';
import { createConfigRegistry } from '../src/router/define-router-utils/config-registry.js';
import type { RuntimeConfig } from '../src/router/define-router-utils/config-types.js';
import { createElementCache } from '../src/router/define-router-utils/element-cache.js';
import { createRouteEntries } from '../src/router/define-router-utils/route-entries.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
} from '../src/router/isomorphic-utils/route-path.js';

// element-cache serializes/deserializes static elements; make it reversible.
vi.mock('../src/server.js', () => ({
  serializeRsc: vi.fn(async (el: unknown) =>
    new TextEncoder().encode(JSON.stringify(el)),
  ),
  deserializeRsc: vi.fn(async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
  ),
}));

type Renderer = (o: {
  routePath: string;
  query: string | undefined;
}) => unknown;

const literal = (name: string): PathSpec => [{ type: 'literal', name }];

const route = (
  name: string,
  opts: {
    isStatic?: boolean;
    rootRenderer?: Renderer;
    elements?: Record<
      string,
      {
        isStatic?: boolean;
        renderer?: Renderer;
        getEtagFromOption?: () => Promise<string | undefined>;
      }
    >;
    slices?: string[];
  } = {},
): RuntimeConfig =>
  ({
    type: 'route',
    path: literal(name),
    isStatic: opts.isStatic ?? false,
    rootElement: {
      isStatic: false,
      renderer: opts.rootRenderer ?? (() => 'root'),
    },
    routeElement: { isStatic: false, renderer: () => 'route' },
    elements: Object.fromEntries(
      Object.entries(opts.elements ?? {}).map(([id, e]) => [
        id,
        {
          isStatic: e.isStatic ?? false,
          renderer: e.renderer ?? (() => id),
          ...(e.getEtagFromOption
            ? { getEtagFromOption: e.getEtagFromOption }
            : {}),
        },
      ]),
    ),
    ...(opts.slices ? { slices: opts.slices } : {}),
  }) as unknown as RuntimeConfig;

const slice = (
  id: string,
  opts: { isStatic?: boolean; renderer?: () => Promise<unknown> } = {},
): RuntimeConfig =>
  ({
    type: 'slice',
    id,
    isStatic: opts.isStatic ?? false,
    renderer: opts.renderer ?? (async () => `slice-${id}`),
  }) as unknown as RuntimeConfig;

const setup = async (configs: RuntimeConfig[]) => {
  const registry = createConfigRegistry(async () => configs);
  await registry.initialize();
  const routeEntries = createRouteEntries(registry);
  return { routeEntries, cache: createElementCache() };
};

describe('getEntriesForRoute', () => {
  it('returns null for an unknown route', async () => {
    const { routeEntries, cache } = await setup([route('home')]);
    const result = await routeEntries.getEntriesForRoute(
      encodeRoutePath('/missing'),
      undefined,
      {},
      cache,
    );
    expect(result).toBeNull();
  });

  it('passes query to a dynamic route renderer but undefined to a static one', async () => {
    let seen: string | undefined = 'unset';
    const dynamic = await setup([
      route('d', { rootRenderer: (o) => ((seen = o.query), 'root') }),
    ]);
    await dynamic.routeEntries.getEntriesForRoute(
      encodeRoutePath('/d'),
      new URLSearchParams({ query: 'a=1' }),
      {},
      dynamic.cache,
    );
    expect(seen).toBe('a=1');

    seen = 'unset';
    const staticR = await setup([
      route('s', {
        isStatic: true,
        rootRenderer: (o) => ((seen = o.query), 'root'),
      }),
    ]);
    await staticR.routeEntries.getEntriesForRoute(
      encodeRoutePath('/s'),
      new URLSearchParams({ query: 'a=1' }),
      {},
      staticR.cache,
    );
    expect(seen).toBeUndefined();
  });

  it('produces root, route, custom-element, and bundled-slice slots plus protocol ids', async () => {
    const { routeEntries, cache } = await setup([
      route('p', { elements: { main: {} }, slices: ['sb'] }),
      slice('sb'),
    ]);
    const result = (await routeEntries.getEntriesForRoute(
      encodeRoutePath('/p'),
      undefined,
      {},
      cache,
    ))!;
    expect(Object.keys(result.elements).sort()).toEqual(
      [ROUTE_ID, IS_STATIC_ID, 'root', 'route:/p', 'main', 'slice:sb'].sort(),
    );
    expect(result.elements[ROUTE_ID]).toEqual(['/p', '']);
    expect(result.elements[IS_STATIC_ID]).toBe(false);
  });

  it('sets HAS404_ID only when a 404 route exists', async () => {
    const without = await setup([route('home')]);
    const a = (await without.routeEntries.getEntriesForRoute(
      encodeRoutePath('/home'),
      undefined,
      {},
      without.cache,
    ))!;
    expect(HAS404_ID in a.elements).toBe(false);

    const with404 = await setup([route('home'), route('404')]);
    const b = (await with404.routeEntries.getEntriesForRoute(
      encodeRoutePath('/home'),
      undefined,
      {},
      with404.cache,
    ))!;
    expect(b.elements[HAS404_ID]).toBe(true);
  });

  it('skips an element whose etag matches the client etag', async () => {
    const { routeEntries, cache } = await setup([
      route('p', {
        elements: { main: { getEtagFromOption: async () => 'e1' } },
      }),
    ]);
    const fresh = (await routeEntries.getEntriesForRoute(
      encodeRoutePath('/p'),
      undefined,
      {},
      cache,
    ))!;
    expect('main' in fresh.elements).toBe(true);
    expect(fresh.etags.main).toBe('e1');

    const skipped = (await routeEntries.getEntriesForRoute(
      encodeRoutePath('/p'),
      undefined,
      { main: 'e1' },
      cache,
    ))!;
    expect('main' in skipped.elements).toBe(false);
  });

  it('caches a static element (renderer runs once) but re-renders a dynamic one', async () => {
    const staticRenderer = vi.fn(() => 'static-el');
    const dynamicRenderer = vi.fn(() => 'dynamic-el');
    const { routeEntries, cache } = await setup([
      route('p', {
        elements: {
          st: { isStatic: true, renderer: staticRenderer },
          dyn: { isStatic: false, renderer: dynamicRenderer },
        },
      }),
    ]);
    const run = () =>
      routeEntries.getEntriesForRoute(
        encodeRoutePath('/p'),
        undefined,
        {},
        cache,
      );
    await run();
    await run();
    expect(staticRenderer).toHaveBeenCalledTimes(1);
    expect(dynamicRenderer).toHaveBeenCalledTimes(2);
  });
});

describe('getEntriesForSlice', () => {
  it('returns the slice slot for a known slice and null for an unknown one', async () => {
    const { routeEntries, cache } = await setup([
      slice('sb', { isStatic: true }),
    ]);
    const entries = (await routeEntries.getEntriesForSlice('sb', cache))!;
    expect(Object.keys(entries.elements)).toEqual(['slice:sb']);
    // immutable (static) slice carries the immutable etag
    expect(entries.etags['slice:sb']).toBeDefined();

    expect(await routeEntries.getEntriesForSlice('nope', cache)).toBeNull();
  });

  it('uses a preResolved config so an earlier pathSpec slice cannot shadow an exact static slice', async () => {
    const dynamicRenderer = vi.fn(async () => 'DYNAMIC');
    const staticRenderer = vi.fn(async () => 'STATIC');
    const dynamicSlice = {
      type: 'slice',
      id: 'foo/dyn',
      isStatic: false,
      pathSpec: [
        { type: 'literal', name: 'foo' },
        { type: 'group', name: 'x' },
      ],
      renderer: dynamicRenderer,
    } as unknown as RuntimeConfig;
    const staticSlice = slice('foo/bar', {
      isStatic: true,
      renderer: staticRenderer,
    });
    // the slug slice precedes the exact static slice in config order
    const { routeEntries, cache } = await setup([dynamicSlice, staticSlice]);

    // resolving by id alone matches the earlier slug slice (the shadow)
    await routeEntries.getEntriesForSlice('foo/bar', cache);
    expect(dynamicRenderer).toHaveBeenCalledTimes(1);
    expect(staticRenderer).not.toHaveBeenCalled();

    // the build path passes the already-resolved static config instead
    await routeEntries.getEntriesForSlice('foo/bar', createElementCache(), {
      sliceConfig: staticSlice as never,
    });
    expect(staticRenderer).toHaveBeenCalledTimes(1);
    expect(dynamicRenderer).toHaveBeenCalledTimes(1);
  });
});
