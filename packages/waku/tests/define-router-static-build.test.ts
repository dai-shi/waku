import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { ROUTE_ID } from '../src/router/common-utils/route-path.js';
import { unstable_defineRouter } from '../src/router/define-router.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

describe('define-router handleBuild', () => {
  it('maps router prefetch module ids through the shared id table', async () => {
    const scripts: string[] = [];
    const moduleIdsByRoute = new Map([
      ['/foo', ['shared-module', 'foo-module']],
      ['/bar', ['shared-module', 'bar-module']],
    ]);
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': { isStatic: true, renderer: () => null },
          },
        },
        {
          type: 'route',
          path: [{ type: 'literal', name: 'bar' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/bar': { isStatic: true, renderer: () => null },
          },
        },
      ],
    });

    type HandleBuildUtils = Parameters<typeof handleBuild>[0];
    const renderRsc: HandleBuildUtils['renderRsc'] = async (
      entries,
      options,
    ) => {
      const route = (entries as Record<string, unknown>)[ROUTE_ID];
      if (!Array.isArray(route) || typeof route[0] !== 'string') {
        throw new Error('route data was not rendered');
      }
      options?.unstable_clientModuleCallback?.(
        moduleIdsByRoute.get(route[0]) ?? [],
      );
      return makeStream();
    };
    const renderHtml: HandleBuildUtils['renderHtml'] = async (
      _elementsStream,
      _html,
      options,
    ) => {
      scripts.push(options.unstable_extraScriptContent ?? '');
      return new Response('<!doctype html>');
    };

    await handleBuild({
      renderRsc,
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml,
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    const script = scripts.find((content) => content.includes('bar-module'));
    if (!script) {
      throw new Error('router prefetch script was not rendered');
    }
    const sandbox: {
      __WAKU_ROUTER_PREFETCH__?: (
        path: string,
        callback: (id: string) => void,
      ) => void;
    } = {};
    runInNewContext(script, sandbox);

    const preloadedIds: string[] = [];
    sandbox.__WAKU_ROUTER_PREFETCH__?.('/bar', (id) => {
      preloadedIds.push(id);
    });

    expect(preloadedIds).toEqual(['shared-module', 'bar-module']);
  });

  it('caches static elements inside routes whose path is non-literal', async () => {
    const layoutRenderer = vi.fn(() => null);
    const pageRenderer = vi.fn(() => null);
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [
            { type: 'literal', name: 'nested' },
            { type: 'group', name: 'name' },
          ],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'layout:/nested': { isStatic: true, renderer: layoutRenderer },
            'page:/nested/[name]': {
              isStatic: false,
              renderer: pageRenderer,
            },
          },
        },
      ],
    });

    const saveBuildMetadata = vi.fn().mockResolvedValue(undefined);
    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    // Static elements inside a dynamic-path route should still be cached
    // at build time so the runtime can serve them without invoking the
    // renderer (which is essential for safely pruning their source files).
    expect(layoutRenderer).toHaveBeenCalled();
    const cached = saveBuildMetadata.mock.calls.find(
      ([key]) => key === 'defineRouter:cachedElements',
    );
    expect(cached, 'cachedElements should be saved').toBeDefined();
    const cachedEntries = JSON.parse(cached![1]);
    expect(Object.keys(cachedEntries)).toContain('slot/layout:/nested');
    // routeElement is keyed by the path template (not a concrete path)
    // so a single cache entry covers every concrete instance under
    // a slug/wildcard route.
    const templateRouteKey = `pathSpec/${JSON.stringify([
      { type: 'literal', name: 'nested' },
      { type: 'group', name: 'name' },
    ])}`;
    expect(Object.keys(cachedEntries)).toContain(templateRouteKey);
  });

  it('caches static slices reachable only from a dynamic-path route', async () => {
    // The standalone slice loop should still pre-build a static slice
    // even when the only routes referencing it are slug/wildcard
    // routes (which the per-route loop processes via
    // cacheStaticElementsOfRoute, not getEntriesForRoute).
    const sliceRenderer = vi.fn(async () => null);
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [
            { type: 'literal', name: 'nested' },
            { type: 'group', name: 'name' },
          ],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/nested/[name]': { isStatic: false, renderer: () => null },
          },
          slices: ['my-slice'],
        },
        {
          type: 'slice',
          id: 'my-slice',
          isStatic: true,
          renderer: sliceRenderer,
        },
      ],
    });

    const saveBuildMetadata = vi.fn().mockResolvedValue(undefined);
    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    expect(sliceRenderer).toHaveBeenCalled();
    const cached = saveBuildMetadata.mock.calls.find(
      ([key]) => key === 'defineRouter:cachedElements',
    );
    expect(cached).toBeDefined();
    expect(Object.keys(JSON.parse(cached![1]))).toContain(
      'slot/slice:my-slice',
    );
  });

  it('wraps EEXIST on static wildcard emit with a clear error', async () => {
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          path: [{ type: 'literal', name: 'test' }],
        },
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          path: [
            { type: 'literal', name: 'test' },
            { type: 'literal', name: 'route' },
          ],
        },
      ],
    });

    const written = new Map<string, 'dir' | 'file'>();
    const generateFile = vi.fn(async (fileName: string) => {
      const segments = fileName.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments.slice(0, i + 1).join('/');
        const type = i === segments.length - 1 ? 'file' : 'dir';
        if (written.has(seg) && written.get(seg) !== type) {
          const err = new Error('EEXIST');
          Object.assign(err, { code: 'EEXIST' });
          throw err;
        }
        written.set(seg, type);
      }
    });

    await expect(
      handleBuild({
        renderRsc: () => Promise.resolve(makeStream()),
        parseRsc: vi.fn(),
        renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
        rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
        saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
        generateFile,
        generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
        unstable_registerPrunableFile: vi.fn(),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toBe(
        'the API route /test/route faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".',
      );
      return true;
    });
  });

  it('hydrates cached elements before any concurrent first request can read them', async () => {
    // Build phase: produce serializableConfigs + cachedElements metadata.
    const buildSave = vi.fn().mockResolvedValue(undefined);
    const buildRouter = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': { isStatic: true, renderer: () => null },
          },
        },
      ],
    });
    await buildRouter.handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: buildSave,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });
    const buildMetadata = new Map<string, string>(
      buildSave.mock.calls.map(([key, value]) => [key, value]),
    );

    // Runtime: empty getConfigs simulates a fully-pruned route - the merge
    // falls back to noRuntimeFn renderers, so any cache miss throws.
    const runtimeRouter = unstable_defineRouter({ getConfigs: async () => [] });

    const loadBuildMetadata = vi.fn(async (key: string) => {
      // Slow down the cachedElements load so two concurrent first requests
      // both have a chance to enter the init block before it resolves.
      if (key === 'defineRouter:cachedElements') {
        await new Promise((r) => setTimeout(r, 30));
      }
      return buildMetadata.get(key);
    });

    const utils = {
      renderRsc: vi.fn().mockResolvedValue(makeStream()),
      renderRscForParse: vi.fn().mockResolvedValue(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({ 'page:/foo': null }),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      loadBuildMetadata,
    };
    const makeReq = () => ({
      type: 'component' as const,
      rscPath: 'R/foo',
      rscParams: undefined,
      pathname: '/foo',
      req: new Request('http://localhost/foo'),
    });

    const results = await Promise.allSettled([
      runtimeRouter.handleRequest(makeReq(), utils),
      runtimeRouter.handleRequest(makeReq(), utils),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
  });

  it('does not register a source file shared by any dynamic config', async () => {
    // A source file that backs both a static and a dynamic config must stay
    // in the runtime bundle - pruning it would break the dynamic config.
    const register = vi.fn();
    const { handleBuild } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': {
              isStatic: true,
              renderer: () => null,
              sourceFile: 'pages/shared.tsx',
            },
          },
        },
        {
          type: 'route',
          path: [{ type: 'literal', name: 'bar' }],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/bar': {
              isStatic: false,
              renderer: () => null,
              sourceFile: 'pages/shared.tsx',
            },
          },
        },
      ],
    });

    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: register,
    });

    expect(register).not.toHaveBeenCalledWith('pages/shared.tsx');
  });
});
