import { describe, expect, it, vi } from 'vitest';
import { DEFINE_ROUTER_METADATA } from '../src/router/define-router-utils/build-metadata.js';
import { createConfigRegistry } from '../src/router/define-router-utils/config-registry.js';
import { toSerializable } from '../src/router/define-router-utils/config-serialization.js';
import type { RuntimeConfig } from '../src/router/define-router-utils/config-types.js';
import { pathSpecAsString } from '../src/router/isomorphic-utils/path-spec.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';

// element-cache (pulled in transitively) imports these; the registry never uses them.
vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn(),
  serializeRsc: vi.fn(),
}));
vi.mock('../src/minimal/server.js', () => ({
  unstable_bytesToBase64: vi.fn(),
}));

const literal = (name: string): PathSpec => [{ type: 'literal', name }];

const route = (
  name: string,
  opts: {
    isStatic?: boolean;
    elements?: Record<string, unknown>;
    pathPattern?: PathSpec;
    searchCodec?: { id: string };
  } = {},
): RuntimeConfig =>
  ({
    type: 'route',
    path: literal(name),
    isStatic: opts.isStatic ?? false,
    rootElement: { isStatic: false, renderer: () => `root:${name}` },
    routeElement: { isStatic: false, renderer: () => `route:${name}` },
    elements: opts.elements ?? {},
    ...(opts.pathPattern ? { pathPattern: opts.pathPattern } : {}),
    ...(opts.searchCodec ? { searchCodec: opts.searchCodec } : {}),
  }) as unknown as RuntimeConfig;

const api = (name: string): RuntimeConfig =>
  ({
    type: 'api',
    path: literal(name),
    isStatic: false,
    handler: async () => new Response('ok'),
  }) as unknown as RuntimeConfig;

const slice = (
  id: string,
  opts: { pathSpec?: PathSpec; isStatic?: boolean } = {},
): RuntimeConfig =>
  ({
    type: 'slice',
    id,
    isStatic: opts.isStatic ?? false,
    renderer: async () => `slice:${id}`,
    ...(opts.pathSpec ? { pathSpec: opts.pathSpec } : {}),
  }) as unknown as RuntimeConfig;

describe('config registry initialization', () => {
  it('calls getConfigs once across repeated initialize', async () => {
    const getConfigs = vi.fn(async () => [route('a')]);
    const registry = createConfigRegistry(getConfigs);
    await registry.initialize();
    await registry.initialize();
    await registry.initialize();
    expect(getConfigs).toHaveBeenCalledTimes(1);
  });

  it('shares one operation across concurrent initialize calls', async () => {
    const getConfigs = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [route('a')];
    });
    const registry = createConfigRegistry(getConfigs);
    await Promise.all([
      registry.initialize(),
      registry.initialize(),
      registry.initialize(),
    ]);
    expect(getConfigs).toHaveBeenCalledTimes(1);
  });

  it('throws "configs not initialized" from accessors before initialize', () => {
    const registry = createConfigRegistry(async () => [route('a')]);
    expect(() => registry.getAll()).toThrow('configs not initialized');
    expect(() => registry.has404()).toThrow('configs not initialized');
    expect(() => registry.findPathConfig('/a')).toThrow(
      'configs not initialized',
    );
  });

  it('merges serialized build configs with runtime functions', async () => {
    const runtime = route('a', {
      elements: { main: { isStatic: false, renderer: () => 'MAIN-A' } },
    });
    const serialized = JSON.stringify([toSerializable(runtime)]);
    const loadBuildMetadata = vi.fn(async (key: string) =>
      key === DEFINE_ROUTER_METADATA.serializableConfigs
        ? serialized
        : undefined,
    );
    const registry = createConfigRegistry(async () => [runtime]);
    await registry.initialize(loadBuildMetadata);
    const merged = registry.getAll().find((c) => c.type === 'route') as never;
    // the renderer stripped during serialization is restored from the runtime config
    expect(
      (
        merged as { elements: Record<string, { renderer: () => unknown }> }
      ).elements.main!.renderer(),
    ).toBe('MAIN-A');
  });

  it('rejects reserved element ids during initialize', async () => {
    const registry = createConfigRegistry(async () => [
      route('a', {
        elements: { root: { isStatic: false, renderer: () => 'x' } },
      }),
    ]);
    await expect(registry.initialize()).rejects.toThrow('Element ID cannot be');
  });

  it('rejects a static slice that declares a pathSpec', async () => {
    const registry = createConfigRegistry(async () => [
      slice('s', { isStatic: true, pathSpec: literal('s') }),
    ]);
    await expect(registry.initialize()).rejects.toThrow(
      'static slice "s" cannot have a pathSpec',
    );
  });
});

describe('config registry queries', () => {
  it('detects whether a 404 route exists', async () => {
    const with404 = createConfigRegistry(async () => [route('404')]);
    await with404.initialize();
    expect(with404.has404()).toBe(true);

    const without = createConfigRegistry(async () => [route('home')]);
    await without.initialize();
    expect(without.has404()).toBe(false);
  });

  it('resolves search codecs by pathPattern-or-path key', async () => {
    const registry = createConfigRegistry(async () => [
      route('foo', {
        pathPattern: literal('foopat'),
        searchCodec: { id: 'cf' },
      }),
    ]);
    await registry.initialize();
    expect(
      registry.resolveSearchCodec(pathSpecAsString(literal('foopat')))?.id,
    ).toBe('cf');
    // the raw path is not the key when a pathPattern is present
    expect(
      registry.resolveSearchCodec(pathSpecAsString(literal('foo'))),
    ).toBeUndefined();
  });

  it('matches route/api by path and slice by id', async () => {
    const registry = createConfigRegistry(async () => [
      route('page'),
      api('data'),
      slice('sb'),
    ]);
    await registry.initialize();
    expect(registry.findPathConfig('/page')?.type).toBe('route');
    expect(registry.findPathConfig('/data')?.type).toBe('api');
    expect(registry.findPathConfig('/nope')).toBeUndefined();
    expect(registry.findSliceConfig('sb')?.sliceConfig.id).toBe('sb');
    expect(registry.findSliceConfig('missing')).toBeUndefined();
  });
});
