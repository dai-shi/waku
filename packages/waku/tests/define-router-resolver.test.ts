import { describe, expect, it, vi } from 'vitest';
import type { Unstable_HandleRequest as HandleRequest } from '../src/minimal/server.js';
import {
  unstable_defineRouter,
  unstable_getRequest,
  unstable_notFound,
  unstable_redirect,
  unstable_rerenderRoute,
} from '../src/router/define-router.js';
import {
  ACTION_LOCATION_HEADER,
  HAS404_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/route-path.js';
import { serializeRsc } from '../src/server.js';

vi.mock('../src/server.js', () => ({
  serializeRsc: vi.fn(async (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)),
  ),
  deserializeRsc: async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
}));

type RouterOptions = Parameters<typeof unstable_defineRouter>[0];
const makeRoute = (content: string, immutable = false) => ({
  elements: {
    root: { immutable, render: () => 'root' },
    route: { immutable, render: () => content },
  },
});

const makeUtils = () => ({
  renderRsc: vi
    .fn<Parameters<HandleRequest>[1]['renderRsc']>()
    .mockImplementation(
      async () =>
        new ReadableStream({ start: (controller) => controller.close() }),
    ),
  renderHtml: vi
    .fn<Parameters<HandleRequest>[1]['renderHtml']>()
    .mockImplementation(async () => new Response('html')),
  loadBuildMetadata: vi
    .fn<Parameters<HandleRequest>[1]['loadBuildMetadata']>()
    .mockResolvedValue(undefined),
});

const rscInput = (pathname: string, query = '') => ({
  type: 'rsc' as const,
  rscPath: encodeRoutePath(pathname),
  rscParams: new URLSearchParams({ query }),
  pathname: '/RSC/payload.txt',
  req: new Request('http://localhost/RSC/payload.txt'),
});

describe('defineRouter route resolver', () => {
  it('does not retain immutable route content for arbitrary runtime paths', async () => {
    vi.mocked(serializeRsc).mockClear();
    const render = vi.fn((path: string) => path);
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path.startsWith('/posts/')
          ? {
              elements: {
                root: { immutable: true, render: () => 'root' },
                route: { immutable: true, render: () => render(path) },
              },
            }
          : null,
    });
    const utils = makeUtils();
    for (const path of [
      '/posts/one',
      '/posts/two',
      '/posts/three',
      '/posts/one',
    ]) {
      await router.handleRequest(rscInput(path), utils);
      expect(utils.renderRsc).toHaveBeenLastCalledWith(
        expect.objectContaining({ ['route:' + path]: path }),
        expect.anything(),
      );
    }
    expect(render).toHaveBeenCalledTimes(4);
    expect(serializeRsc).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'probes 404 availability once across concurrent requests (exists: %s)',
    async (exists) => {
      const resolve = vi.fn<RouterOptions['resolve']>(async (path, query) =>
        path === '/404'
          ? exists
            ? makeRoute('not found')
            : null
          : makeRoute(query),
      );
      const router = unstable_defineRouter({ resolve });
      const utils = makeUtils();
      await Promise.all([
        router.handleRequest(rscInput('/one'), utils),
        router.handleRequest(rscInput('/two'), utils),
      ]);
      await router.handleRequest(
        {
          type: 'http',
          pathname: '/three',
          req: new Request('http://localhost/three?q=latest'),
        },
        utils,
      );
      expect(
        resolve.mock.calls.filter(([path]) => path === '/404'),
      ).toHaveLength(1);
      expect(utils.renderRsc).toHaveBeenLastCalledWith(
        expect.objectContaining({ 'route:/three': 'q=latest' }),
        expect.anything(),
      );
    },
  );

  it('retries a failed 404 probe and resolves the 404 content for each visit', async () => {
    let attempts = 0;
    const resolve = vi.fn<RouterOptions['resolve']>(async (path, query) => {
      if (path === '/404' && ++attempts === 1) {
        throw new Error('CMS unavailable');
      }
      return makeRoute(query);
    });
    const router = unstable_defineRouter({ resolve });
    const utils = makeUtils();
    await expect(router.handleRequest(rscInput('/'), utils)).rejects.toThrow(
      'CMS unavailable',
    );
    await router.handleRequest(rscInput('/'), utils);
    await router.handleRequest(rscInput('/404', 'q=first'), utils);
    await router.handleRequest(rscInput('/404', 'q=second'), utils);
    expect(attempts).toBe(4);
    expect(utils.renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({ 'route:/404': 'q=second', [HAS404_ID]: true }),
      expect.anything(),
    );
  });

  it('reuses build-preloaded route content without retaining unbuilt routes', async () => {
    vi.mocked(serializeRsc).mockClear();
    const render = vi.fn((path: string) => path);
    const resolve: RouterOptions['resolve'] = async (path) =>
      path.startsWith('/posts/')
        ? {
            elements: {
              root: { immutable: true, render: () => 'root' },
              route: { immutable: true, render: () => render(path) },
            },
          }
        : null;
    const router = unstable_defineRouter({
      resolve,
      getBuildPaths: async () => ['/posts/built'],
    });
    const metadata = new Map<string, string>();
    await router.handleBuild({
      ...makeUtils(),
      rscPath2pathname: (path) => path,
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      saveBuildMetadata: async (key, value) => {
        metadata.set(key, value);
      },
      unstable_registerPrunableFile: vi.fn(),
    });
    expect(render).toHaveBeenCalledTimes(1);
    render.mockClear();
    const runtime = unstable_defineRouter({ resolve });
    const utils = makeUtils();
    utils.loadBuildMetadata.mockImplementation(async (key) =>
      metadata.get(key),
    );
    await runtime.handleRequest(rscInput('/posts/built'), utils);
    expect(render).not.toHaveBeenCalled();
    expect(utils.renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({ 'route:/posts/built': '/posts/built' }),
      expect.anything(),
    );
    await runtime.handleRequest(rscInput('/posts/unbuilt'), utils);
    await runtime.handleRequest(rscInput('/posts/unbuilt'), utils);
    expect(render).toHaveBeenCalledTimes(2);
    expect(serializeRsc).toHaveBeenCalledTimes(2);
  });

  it('rejects a source that collides with router metadata', async () => {
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          ...makeRoute('route').elements,
          [ROUTE_ID]: { render: () => 'content' },
        },
      }),
    });
    const utils = makeUtils();
    await expect(router.handleRequest(rscInput('/'), utils)).rejects.toThrow(
      'Reserved router element ID: ROUTE',
    );
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });
  it('normalizes build paths like HTTP and escapes prefetch patterns', async () => {
    const path = '/caf%C3%A9+[x].txt';
    const resolve = vi.fn<RouterOptions['resolve']>(async (pathname) =>
      pathname === path ? makeRoute('static', true) : null,
    );
    const router = unstable_defineRouter({
      resolve,
      getBuildPaths: async () => ['/caf\u00e9+[x].txt/'],
    });
    const metadata = new Map<string, string>();
    const generateFile = vi.fn().mockResolvedValue(undefined);
    await router.handleBuild({
      ...makeUtils(),
      rscPath2pathname: (path) => path,
      generateFile,
      generateDefaultHtml: vi.fn(),
      saveBuildMetadata: async (key, value) => {
        metadata.set(key, value);
      },
      unstable_registerPrunableFile: vi.fn(),
    });
    expect(resolve).toHaveBeenCalledWith(path, '');
    expect(generateFile).toHaveBeenCalledWith(
      path + '/index.html',
      expect.anything(),
    );
    const patterns = JSON.parse(
      metadata.get('defineRouter:path2moduleIds')!,
    ) as Record<string, string[]>;
    const pattern = Object.keys(patterns)[0]!;
    expect(new RegExp(pattern).test(path)).toBe(true);
    expect(new RegExp(pattern).test('/caf%C3%A9xxx.txt')).toBe(false);
  });

  it('rejects build paths with a query instead of silently building another URL', async () => {
    const router = unstable_defineRouter({
      resolve: async () => makeRoute('static', true),
      getBuildPaths: async () => ['/items?q=one'],
    });
    const generateFile = vi.fn();
    await expect(
      router.handleBuild({
        ...makeUtils(),
        rscPath2pathname: (path) => path,
        generateFile,
        generateDefaultHtml: vi.fn(),
        saveBuildMetadata: vi.fn(),
        unstable_registerPrunableFile: vi.fn(),
      }),
    ).rejects.toThrow('Build path must be a pathname');
    expect(generateFile).not.toHaveBeenCalled();
  });
  it('treats a not-found thrown by the 404 probe as no custom 404', async () => {
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path === '/' ? makeRoute('home') : unstable_notFound(),
    });
    const utils = makeUtils();
    await router.handleRequest(rscInput('/'), utils);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ 'route:/': 'home', [ROUTE_ID]: ['/', ''] }),
      expect.anything(),
    );
    expect(utils.renderRsc.mock.calls[0]![0]).not.toHaveProperty(HAS404_ID);
    expect(await router.handleRequest(rscInput('/missing'), utils)).toBeNull();
  });
  it('uses the same normalized route and query for document and RSC requests', async () => {
    const resolve = vi.fn<RouterOptions['resolve']>(async (path, query) =>
      path === '/items' ? makeRoute(query) : null,
    );
    const router = unstable_defineRouter({ resolve });
    const utils = makeUtils();
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/items/index.html',
        req: new Request('http://localhost/items/index.html?q=a%20b'),
      },
      utils,
    );
    expect(resolve).toHaveBeenCalledWith('/items', 'q=a+b');
    expect(utils.renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        [ROUTE_ID]: ['/items', 'q=a+b'],
        'route:/items': 'q=a+b',
      }),
      expect.anything(),
    );
    await router.handleRequest(rscInput('/items', 'q=a+b'), utils);
    expect(utils.renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        [ROUTE_ID]: ['/items', 'q=a+b'],
        'route:/items': 'q=a+b',
      }),
      expect.anything(),
    );
  });

  it('executes API handlers only for HTTP and preserves method, body and query', async () => {
    const handler = vi.fn(
      async (req: Request) =>
        new Response(
          req.method + ':' + new URL(req.url).search + ':' + (await req.text()),
        ),
    );
    const router = unstable_defineRouter({
      resolve: async (path) => (path === '/api' ? handler : null),
    });
    expect(
      await router.handleRequest(rscInput('/api'), makeUtils()),
    ).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/base/api?q=one', {
          method: 'POST',
          body: 'body',
        }),
      },
      makeUtils(),
    );
    expect(response).toBeInstanceOf(Response);
    expect(await (response as Response).text()).toBe('POST:?q=one:body');
    expect(new URL(handler.mock.calls[0]![0].url).pathname).toBe('/api');
  });

  it('preserves the handler body when resolution reads a request clone', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        expect(await unstable_getRequest().clone().text()).toBe('body');
        return async (req) => new Response(await req.text());
      },
    });
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/api', {
          method: 'POST',
          body: 'body',
        }),
      },
      makeUtils(),
    );
    expect(await (response as Response).text()).toBe('body');
  });

  it('omits sources with matching validators and sends client route metadata', async () => {
    const render = vi.fn(() => 'content');
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path === '/'
          ? {
              elements: {
                ...makeRoute('route', true).elements,
                content: { render, getEtag: async () => 'v1' },
              },
            }
          : null,
    });
    const utils = makeUtils();
    await router.handleRequest(
      { ...rscInput('/'), etags: { root: 1, 'route:/': 1, content: 'v1' } },
      utils,
    );
    expect(render).not.toHaveBeenCalled();
    expect(utils.renderRsc).toHaveBeenCalledWith(
      { [ROUTE_ID]: ['/', ''], [IS_STATIC_ID]: false },
      { etags: {} },
    );
  });

  it('resolves independently fetched slot IDs without page configuration', async () => {
    const resolveElement = vi.fn(async (id: string) =>
      id === 'slice:fragment'
        ? { render: () => 'fragment', getEtag: async () => 'v1' }
        : null,
    );
    const router = unstable_defineRouter({
      resolve: async () => null,
      resolveElement,
    });
    const utils = makeUtils();
    await router.handleRequest(
      { ...rscInput('/'), rscPath: encodeSliceId('fragment') },
      utils,
    );
    expect(resolveElement).toHaveBeenCalledWith('slice:fragment');
    expect(utils.renderRsc).toHaveBeenCalledWith(
      { 'slice:fragment': 'fragment' },
      { etags: { 'slice:fragment': 'v1' } },
    );
  });

  it('preserves CSR-only routes while still serving their RSC payload', async () => {
    const render = vi.fn(() => 'client route');
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path === '/'
          ? {
              noSsr: true,
              elements: { root: { render: () => 'root' }, route: { render } },
            }
          : null,
    });
    const utils = makeUtils();
    expect(
      await router.handleRequest(
        { type: 'http', pathname: '/', req: new Request('http://localhost/') },
        utils,
      ),
    ).toBe('fallback');
    expect(render).not.toHaveBeenCalled();
    await router.handleRequest(rscInput('/'), utils);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ 'route:/': 'client route' }),
      expect.anything(),
    );
  });

  it('uses a custom 404 for a not-found thrown during resolution', async () => {
    const router = unstable_defineRouter({
      resolve: async (path, query) =>
        path === '/404' ? makeRoute('not found:' + query) : unstable_notFound(),
    });
    const utils = makeUtils();
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/missing',
        req: new Request('http://localhost/missing?q=one'),
      },
      utils,
    );
    expect(response).toBeInstanceOf(Response);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        [ROUTE_ID]: ['/404', 'q=one'],
        [HAS404_ID]: true,
        'route:/404': 'not found:q=one',
      }),
      expect.anything(),
    );
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ status: 404, unstable_rethrowNotFound: false }),
    );
  });

  it('returns a redirected route in the same RSC response', async () => {
    const router = unstable_defineRouter({
      resolve: async (path, query) =>
        path === '/old'
          ? {
              elements: {
                ...makeRoute('').elements,
                route: { render: () => unstable_redirect('/next?q=one') },
              },
            }
          : path === '/next'
            ? makeRoute(query)
            : null,
    });
    const utils = makeUtils();
    await router.handleRequest(rscInput('/old'), utils);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        [ROUTE_ID]: ['/next', 'q=one'],
        'route:/next': 'q=one',
      }),
      expect.anything(),
    );
  });

  it('keeps origin rerenders and action values in the client protocol', async () => {
    const router = unstable_defineRouter({
      resolve: async (path, query) =>
        path === '/origin' ? makeRoute(query) : null,
    });
    const utils = makeUtils();
    await router.handleRequest(
      {
        type: 'call',
        pathname: '/RSC/F/action.txt',
        req: new Request('http://localhost/RSC/F/action.txt', {
          method: 'POST',
          headers: { [ACTION_LOCATION_HEADER]: '/origin?q=one' },
        }),
        args: [],
        fn: async () => {
          unstable_rerenderRoute();
          return 'result';
        },
      },
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        [IS_ORIGIN_ID]: true,
        [ROUTE_ID]: ['/origin', 'q=one'],
      }),
      expect.objectContaining({ value: 'result' }),
    );
  });

  it('runs resolution in the interceptor request scope', async () => {
    const order: string[] = [];
    const router = unstable_defineRouter({
      resolve: async (path) => {
        order.push(unstable_getRequest().headers.get('marker')!);
        return path === '/' ? makeRoute('route') : null;
      },
      unstable_interceptors: [
        async (next) => {
          order.push('before');
          const result = await next();
          order.push('after');
          return result;
        },
      ],
    });
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/',
        req: new Request('http://localhost/', {
          headers: { marker: 'request' },
        }),
      },
      makeUtils(),
    );
    expect(order[0]).toBe('before');
    expect(order.at(-1)).toBe('after');
    expect(order.slice(1, -1).every((value) => value === 'request')).toBe(true);
  });

  it('builds resolved static routes and APIs but caches only immutable parts of mutable routes', async () => {
    const mutableRender = vi.fn(() => 'dynamic');
    const resolve: RouterOptions['resolve'] = async (path) =>
      path === '/static'
        ? makeRoute('static', true)
        : path === '/api'
          ? async () => new Response('api')
          : path === '/dynamic'
            ? {
                elements: {
                  root: { immutable: true, render: () => 'root' },
                  route: { render: mutableRender },
                },
              }
            : null;
    const router = unstable_defineRouter({
      resolve,
      getBuildPaths: async () => ['/static', '/dynamic', '/api'],
    });
    const files = new Map<string, unknown>();
    const metadata = new Map<string, string>();
    const utils = makeUtils();
    await router.handleBuild({
      ...utils,
      rscPath2pathname: (path) => 'payload/' + path,
      generateFile: async (path, body) => {
        files.set(path, body);
      },
      generateDefaultHtml: vi.fn(),
      saveBuildMetadata: async (key, value) => {
        metadata.set(key, value);
      },
      unstable_registerPrunableFile: vi.fn(),
    });
    expect(files.has('/static/index.html')).toBe(true);
    expect(files.has('payload/' + encodeRoutePath('/static'))).toBe(true);
    expect(files.has('/api')).toBe(true);
    expect(files.has('/dynamic/index.html')).toBe(false);
    expect(mutableRender).not.toHaveBeenCalled();
    const runtime = unstable_defineRouter({ resolve });
    const runtimeUtils = makeUtils();
    runtimeUtils.loadBuildMetadata.mockImplementation(async (key) =>
      metadata.get(key),
    );
    await runtime.handleRequest(rscInput('/dynamic'), runtimeUtils);
    expect(runtimeUtils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        root: 'root',
        'route:/dynamic': 'dynamic',
        [IS_STATIC_ID]: false,
      }),
      expect.anything(),
    );
    expect(mutableRender).toHaveBeenCalledTimes(1);
  });

  it('emits independently resolved immutable elements without route build paths', async () => {
    const id = 'slice:folder/fragment';
    const render = vi.fn(() => 'fragment');
    const resolveElement: RouterOptions['resolveElement'] = async (slotId) =>
      slotId === id ? { immutable: true, render } : null;
    const router = unstable_defineRouter({
      resolve: async () => null,
      resolveElement,
      getBuildElementIds: async () => [id],
    });
    const files = new Map<string, string>();
    const metadata = new Map<string, string>();
    const utils = makeUtils();
    utils.renderRsc.mockImplementation(
      async (elements, options) =>
        new Response(JSON.stringify({ elements, etags: options?.etags })).body!,
    );
    await router.handleBuild({
      ...utils,
      rscPath2pathname: (path) => 'payload/' + path,
      generateFile: async (path, body) => {
        files.set(path, await new Response(body).text());
      },
      generateDefaultHtml: vi.fn(),
      saveBuildMetadata: async (key, value) => {
        metadata.set(key, value);
      },
      unstable_registerPrunableFile: vi.fn(),
    });
    expect(files.size).toBe(1);
    expect(
      JSON.parse(files.get('payload/' + encodeSliceId('folder/fragment'))!),
    ).toEqual({ elements: { [id]: 'fragment' }, etags: { [id]: 1 } });
    const runtime = unstable_defineRouter({
      resolve: async () => null,
      resolveElement,
    });
    const runtimeUtils = makeUtils();
    runtimeUtils.loadBuildMetadata.mockImplementation(async (key) =>
      metadata.get(key),
    );
    await runtime.handleRequest(
      { ...rscInput('/'), rscPath: encodeSliceId('folder/fragment') },
      runtimeUtils,
    );
    expect(runtimeUtils.renderRsc).toHaveBeenCalledWith(
      { [id]: 'fragment' },
      { etags: { [id]: 1 } },
    );
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([
    ['slice:missing', 'Build element did not resolve'],
    ['slice:mutable', 'Build element must be immutable'],
    ['root', 'Unsupported build element ID'],
  ])(
    'rejects an invalid independently built element: %s',
    async (id, message) => {
      const router = unstable_defineRouter({
        resolve: async () => null,
        resolveElement: async (slotId) =>
          slotId === 'slice:mutable' ? { render: () => 'mutable' } : null,
        getBuildElementIds: async () => [id],
      });
      const generateFile = vi.fn();
      await expect(
        router.handleBuild({
          ...makeUtils(),
          rscPath2pathname: (path) => path,
          generateFile,
          generateDefaultHtml: vi.fn(),
          saveBuildMetadata: vi.fn(),
          unstable_registerPrunableFile: vi.fn(),
        }),
      ).rejects.toThrow(message + ': ' + id);
      expect(generateFile).not.toHaveBeenCalled();
    },
  );
});
