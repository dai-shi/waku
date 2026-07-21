import { describe, expect, it } from 'vitest';
import {
  mergeWithRuntimeConfigs,
  pathSpecKey,
  toSerializable,
} from '../src/router/define-router-utils/config-serialization.js';
import type {
  ApiConfig,
  RouteConfig,
  SerializableRouteConfig,
  SliceConfig,
} from '../src/router/define-router-utils/config-types.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';

const path = (name: string): PathSpec => [{ type: 'literal', name }];
const option = { routePath: '/foo', query: undefined };

const makeRoute = (name: string): RouteConfig => ({
  type: 'route',
  path: path(name),
  isStatic: false,
  rootElement: {
    isStatic: false,
    renderer: () => `root:${name}`,
    getEtagFromOption: async () => `etag-root:${name}`,
  },
  routeElement: {
    isStatic: false,
    renderer: () => `route:${name}`,
  },
  elements: {
    main: {
      isStatic: false,
      renderer: () => `main:${name}`,
      getEtagFromOption: async () => `etag-main:${name}`,
      sourceFile: `${name}/main.tsx`,
    },
  },
  searchCodec: { id: `codec:${name}` } as NonNullable<
    RouteConfig['searchCodec']
  >,
});

const makeApi = (name: string): ApiConfig => ({
  type: 'api',
  path: path(name),
  isStatic: true,
  handler: async () => new Response(`api:${name}`),
  sourceFile: `${name}/api.ts`,
});

const makeSlice = (id: string): SliceConfig => ({
  type: 'slice',
  id,
  isStatic: true,
  renderer: async () => `slice:${id}`,
  getEtagFromParams: async () => `etag-slice:${id}`,
});

describe('toSerializable', () => {
  it('strips renderer and etag functions (and searchCodec) from a route', () => {
    const s = toSerializable(makeRoute('foo')) as SerializableRouteConfig;
    expect('searchCodec' in s).toBe(false);
    expect('renderer' in s.rootElement).toBe(false);
    expect('getEtagFromOption' in s.rootElement).toBe(false);
    expect('renderer' in s.routeElement).toBe(false);
    expect('renderer' in s.elements.main!).toBe(false);
    expect('getEtagFromOption' in s.elements.main!).toBe(false);
    // non-function metadata is preserved
    expect(s.isStatic).toBe(false);
    expect(s.path).toEqual(path('foo'));
    expect(s.elements.main!.sourceFile).toBe('foo/main.tsx');
  });

  it('strips the api handler and the slice renderer/etag', () => {
    const sApi = toSerializable(makeApi('bar'));
    expect('handler' in sApi).toBe(false);
    expect(sApi).toMatchObject({
      type: 'api',
      isStatic: true,
      sourceFile: 'bar/api.ts',
    });

    const sSlice = toSerializable(makeSlice('sliceA'));
    expect('renderer' in sSlice).toBe(false);
    expect('getEtagFromParams' in sSlice).toBe(false);
    expect(sSlice).toMatchObject({
      type: 'slice',
      id: 'sliceA',
      isStatic: true,
    });
  });
});

describe('mergeWithRuntimeConfigs', () => {
  it('restores runtime functions by matching path and slice id', async () => {
    const route = makeRoute('foo');
    const api = makeApi('bar');
    const slice = makeSlice('sliceA');
    const merged = mergeWithRuntimeConfigs(
      [toSerializable(route), toSerializable(api), toSerializable(slice)],
      [route, api, slice],
    );
    const mRoute = merged.find((c) => c.type === 'route') as RouteConfig;
    expect(mRoute.rootElement.renderer(option)).toBe('root:foo');
    expect(await mRoute.rootElement.getEtagFromOption!(option)).toBe(
      'etag-root:foo',
    );
    expect(mRoute.elements.main!.renderer(option)).toBe('main:foo');

    const mApi = merged.find((c) => c.type === 'api') as ApiConfig;
    expect(
      await (
        await mApi.handler(new Request('http://x/'), { params: {} })
      ).text(),
    ).toBe('api:bar');

    const mSlice = merged.find((c) => c.type === 'slice') as SliceConfig;
    expect(await mSlice.renderer()).toBe('slice:sliceA');
  });

  it('falls back to the shared root renderer for a route with no runtime match', () => {
    const routeA = makeRoute('a');
    const routeB = makeRoute('b');
    // only routeA is present at runtime
    const merged = mergeWithRuntimeConfigs(
      [toSerializable(routeA), toSerializable(routeB)],
      [routeA],
    );
    const mB = merged.find(
      (c) =>
        c.type === 'route' && pathSpecKey(c.path) === pathSpecKey(path('b')),
    ) as RouteConfig;
    expect(mB.rootElement.renderer(option)).toBe('root:a');
  });

  it('falls back to a shared named-element renderer', () => {
    const routeA = makeRoute('a');
    const routeB = makeRoute('b');
    const merged = mergeWithRuntimeConfigs(
      [toSerializable(routeA), toSerializable(routeB)],
      [routeA],
    );
    const mB = merged.find(
      (c) =>
        c.type === 'route' && pathSpecKey(c.path) === pathSpecKey(path('b')),
    ) as RouteConfig;
    expect(mB.elements.main!.renderer(option)).toBe('main:a');
  });

  it('throws the rebuild-required error when no runtime function exists', async () => {
    const route = makeRoute('foo');
    const api = makeApi('bar');
    const slice = makeSlice('sliceA');
    // empty runtime configs: no matches and no shared fallbacks
    const merged = mergeWithRuntimeConfigs(
      [toSerializable(route), toSerializable(api), toSerializable(slice)],
      [],
    );
    const mRoute = merged.find((c) => c.type === 'route') as RouteConfig;
    expect(() => mRoute.rootElement.renderer(option)).toThrow(
      'no runtime function found',
    );
    expect(() => mRoute.routeElement.renderer(option)).toThrow(
      'rebuild required',
    );

    const mApi = merged.find((c) => c.type === 'api') as ApiConfig;
    await expect(
      mApi.handler(new Request('http://x/'), { params: {} }),
    ).rejects.toThrow('no runtime function found');

    const mSlice = merged.find((c) => c.type === 'slice') as SliceConfig;
    await expect(mSlice.renderer()).rejects.toThrow('rebuild required');
  });

  it('does not serialize searchCodec but restores it from runtime config', () => {
    const route = makeRoute('foo');
    const merged = mergeWithRuntimeConfigs([toSerializable(route)], [route]);
    const mRoute = merged.find((c) => c.type === 'route') as RouteConfig;
    expect(mRoute.searchCodec).toBe(route.searchCodec);

    // with no runtime match the codec stays absent
    const withoutRuntime = mergeWithRuntimeConfigs([toSerializable(route)], []);
    const mRouteNoRuntime = withoutRuntime.find(
      (c) => c.type === 'route',
    ) as RouteConfig;
    expect('searchCodec' in mRouteNoRuntime).toBe(false);
  });
});

describe('pathSpecKey', () => {
  it('is stable for equal specs and distinct for different specs', () => {
    expect(pathSpecKey(path('foo'))).toBe(pathSpecKey(path('foo')));
    expect(pathSpecKey(path('foo'))).not.toBe(pathSpecKey(path('bar')));
  });
});
