import { describe, expect, it, vi } from 'vitest';
import { unstable_defineRouter } from '../src/router/define-router.js';
import {
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/route-path.js';
import {
  unstable_getRequest,
  unstable_redirect,
  unstable_rerenderRoute,
  unstable_setNonce,
} from '../src/router/server.js';

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

const makeUtils = (loadBuildMetadata = vi.fn()) => ({
  renderRsc: vi.fn().mockResolvedValue(makeStream()),
  parseRsc: vi.fn(),
  renderHtml: vi.fn().mockResolvedValue(new Response('ok')),
  loadBuildMetadata,
});

const dynamicRoute = (name: string) => ({
  type: 'route' as const,
  path: name === '/' ? [] : [{ type: 'literal' as const, name: name.slice(1) }],
  isStatic: false,
  rootElement: { isStatic: false, renderer: () => 'root' },
  routeElement: { isStatic: false, renderer: () => 'route' },
  elements: {},
});

describe('request dispatch', () => {
  it('returns null for an unknown rsc route', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/about')],
    });
    const res = await handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/missing',
        rscPath: encodeRoutePath('/missing'),
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/missing'),
      },
      makeUtils(),
    );
    expect(res).toBeNull();
  });

  it('serves a single-slice rsc request', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'slice' as const,
          id: 'sidebar',
          isStatic: false,
          renderer: async () => 'SIDEBAR',
        },
      ],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/S/sidebar',
        rscPath: encodeSliceId('sidebar'),
        rscParams: undefined,
        req: new Request('http://localhost/RSC/S/sidebar'),
      },
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ 'slice:sidebar': 'SIDEBAR' }),
      expect.anything(),
    );
  });

  it('merges entries scheduled by a server function rerender', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/')],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'call',
        pathname: '/RSC/F/x.txt',
        fn: async () => {
          unstable_rerenderRoute('/');
          return 'fn-value';
        },
        args: [],
        req: new Request('http://localhost/RSC/F/x.txt', { method: 'POST' }),
      },
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/', ''] }),
      { value: 'fn-value', etags: {} },
    );
  });

  it('responds to a server-function redirect with the destination route', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'call',
        pathname: '/RSC/F/x.txt',
        fn: async () => {
          unstable_redirect('/dest', 303);
        },
        args: [],
        req: new Request('http://localhost/RSC/F/x.txt', { method: 'POST' }),
      },
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/dest', ''] }),
      { etags: {} },
    );
  });

  it('maps api params and rewrites the request pathname', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api' as const,
          path: [
            { type: 'literal' as const, name: 'api' },
            { type: 'group' as const, name: 'slug' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/api/hello',
        req: new Request('http://localhost/prefixed/api/hello?q=1'),
      },
      makeUtils(),
    );
    expect(res).toBeInstanceOf(Response);
    const [apiReq, apiContext] = apiHandler.mock.calls[0]!;
    expect(new URL(apiReq.url).pathname).toBe('/api/hello');
    expect(apiContext).toEqual({ params: { slug: 'hello' } });
  });

  it('renders the 404 route for an unknown http page', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/nowhere',
        req: new Request('http://localhost/nowhere'),
      },
      utils,
    );
    expect(res).toBeInstanceOf(Response);
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it('returns fallback for a noSsr route', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [{ ...dynamicRoute('/nossr'), noSsr: true }],
    });
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/nossr',
        req: new Request('http://localhost/nossr'),
      },
      makeUtils(),
    );
    expect(res).toBe('fallback');
  });

  it('loads cached-elements and path2moduleIds metadata only once', async () => {
    const loadBuildMetadata = vi.fn(async (key: string) =>
      key === 'defineRouter:cachedElements' ? '{}' : undefined,
    );
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/')],
    });
    const request = () =>
      handleRequest(
        {
          type: 'http',
          pathname: '/',
          req: new Request('http://localhost/'),
        },
        makeUtils(loadBuildMetadata),
      );
    await request();
    await request();
    const countFor = (key: string) =>
      loadBuildMetadata.mock.calls.filter(([k]) => k === key).length;
    expect(countFor('defineRouter:cachedElements')).toBe(1);
    expect(countFor('defineRouter:path2moduleIds')).toBe(1);
  });

  it('exposes request-store APIs from router/server inside an interceptor', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/')],
      unstable_interceptors: [
        async (next) => {
          unstable_setNonce(
            `n-${unstable_getRequest().headers.get('x-n') ?? ''}`,
          );
          return next();
        },
      ],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'http',
        pathname: '/',
        req: new Request('http://localhost/', {
          headers: { 'x-n': 'abc' },
        }),
      },
      utils,
    );
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ nonce: 'n-abc' }),
    );
  });
});
