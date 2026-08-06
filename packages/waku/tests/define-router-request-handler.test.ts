import { describe, expect, it, vi } from 'vitest';
import {
  unstable_createCustomError,
  unstable_getErrorInfo,
} from '../src/minimal/server.js';
import { unstable_defineRouter } from '../src/router/define-router.js';
import {
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/route-path.js';
import {
  unstable_getRequest,
  unstable_notFound,
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

const rscInput = (rscPath: string, rscParams?: unknown) => ({
  type: 'rsc' as const,
  pathname: '/RSC/' + rscPath,
  rscPath,
  rscParams,
  req: new Request('http://localhost/RSC/' + rscPath),
});

const callInput = (fn: () => Promise<unknown>) => ({
  type: 'call' as const,
  pathname: '/RSC/F/x.txt',
  fn,
  args: [],
  req: new Request('http://localhost/RSC/F/x.txt', { method: 'POST' }),
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
      rscInput(encodeRoutePath('/missing')),
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
    await handleRequest(rscInput(encodeSliceId('sidebar')), utils);
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
      callInput(async () => {
        unstable_rerenderRoute('/');
        return 'fn-value';
      }),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/', ''] }),
      { value: 'fn-value', etags: {} },
    );
  });

  it('keeps the query of a server-function redirect', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_redirect('/dest?a=1' as never);
      }),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/dest', 'a=1'] }),
      { etags: {} },
    );
  });

  it('leaves a server-function redirect to a non-route for the browser', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/dest'), dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await expect(
      handleRequest(
        callInput(async () => {
          unstable_redirect('/nowhere' as never);
        }),
        utils,
      ),
    ).rejects.toThrow('Redirect');
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/dest',
    '//example.com/dest',
    '/dest#frag',
    '/\\example.com/dest',
    '/\t/evil.com/dest',
  ])(
    'leaves a server-function redirect to %s for the browser to follow',
    async (location) => {
      const { handleRequest } = unstable_defineRouter({
        getConfigs: async () => [dynamicRoute('/dest')],
      });
      const utils = makeUtils();
      const err = await handleRequest(
        callInput(async () => {
          throw unstable_createCustomError('Redirect', {
            status: 307,
            location,
          });
        }),
        utils,
      ).catch((e: unknown) => e);
      expect(unstable_getErrorInfo(err)).toEqual({ status: 307, location });
      expect(utils.renderRsc).not.toHaveBeenCalled();
    },
  );

  it('responds to a server-function redirect with the destination route', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_redirect('/dest', 303);
      }),
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

  it('answers an rsc request for a missing route with the 404 payload', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      rscInput(
        encodeRoutePath('/missing'),
        new URLSearchParams({ query: 'foo=bar' }),
      ),
      utils,
    );
    expect(res).not.toBeNull();
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/404', 'foo=bar'] }),
      expect.anything(),
    );
  });

  it('answers a route that renders not found with the 404 payload', async () => {
    const notFound = {
      ...dynamicRoute('/gone'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_notFound();
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [notFound, dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await handleRequest(rscInput(encodeRoutePath('/gone')), utils);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/404', ''] }),
      expect.anything(),
    );
  });

  it('propagates a non-404 failure from a route render', async () => {
    const boom = {
      ...dynamicRoute('/boom'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          throw new Error('kaboom');
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [boom, dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await expect(
      handleRequest(rscInput(encodeRoutePath('/boom')), utils),
    ).rejects.toThrow('kaboom');
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it('gives up quietly when the 404 route renders not found', async () => {
    const recursive = {
      ...dynamicRoute('/404'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_notFound();
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [recursive],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      rscInput(encodeRoutePath('/missing')),
      utils,
    );
    expect(res).toBeNull();
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it('surfaces a broken 404 route instead of reporting no route', async () => {
    const broken = {
      ...dynamicRoute('/404'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          throw new Error('the 404 page is broken');
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [broken],
    });
    await expect(
      handleRequest(rscInput(encodeRoutePath('/missing')), makeUtils()),
    ).rejects.toThrow('the 404 page is broken');
  });

  it('responds to a route redirect with the destination route', async () => {
    const moved = {
      ...dynamicRoute('/moved'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/dest?a=1' as never);
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [moved, dynamicRoute('/dest')],
    });
    const utils = makeUtils();

    await handleRequest(rscInput(encodeRoutePath('/moved')), utils);

    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/dest', 'a=1'] }),
      { etags: {} },
    );
  });

  it('asks interceptors about the destination, not the route that moved', async () => {
    const seen: string[] = [];
    const moved = {
      ...dynamicRoute('/moved'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/dest' as never);
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [moved, dynamicRoute('/dest')],
      unstable_interceptors: [
        async (next) => {
          seen.push(new URL(unstable_getRequest().url).pathname);
          return next();
        },
      ],
    });

    await handleRequest(rscInput(encodeRoutePath('/moved')), makeUtils());

    // a guard on /dest would never run if it only saw the request for /moved
    expect(seen[seen.length - 1]).toBe('/dest');
  });

  it('keeps the base path on the destination it asks about', async () => {
    const seen: string[] = [];
    const moved = {
      ...dynamicRoute('/moved'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/dest' as never);
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [moved, dynamicRoute('/dest')],
      unstable_interceptors: [
        async (next) => {
          seen.push(new URL(unstable_getRequest().url).pathname);
          return next();
        },
      ],
    });
    const rscPath = encodeRoutePath('/moved');

    await handleRequest(
      {
        type: 'rsc' as const,
        // the app is mounted under /docs, so getInput strips it from pathname
        pathname: '/RSC/' + rscPath,
        rscPath,
        rscParams: undefined,
        req: new Request('http://localhost/docs/RSC/' + rscPath),
      },
      makeUtils(),
    );

    expect(seen[seen.length - 1]).toBe('/docs/dest');
  });

  it('hands off a route redirect whose destination fails to render', async () => {
    const moved = {
      ...dynamicRoute('/moved'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/dest' as never);
        },
      },
    };
    const broken = {
      ...dynamicRoute('/dest'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          throw new Error('the destination is broken');
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [moved, broken],
    });
    const utils = makeUtils();

    const err = await handleRequest(
      rscInput(encodeRoutePath('/moved')),
      utils,
    ).catch((e: unknown) => e);

    // the browser goes to /dest and meets the error there, at its own url
    expect(unstable_getErrorInfo(err)).toEqual({
      status: 307,
      location: '/dest',
    });
  });

  it('hands off a route redirect the destination cannot answer', async () => {
    const moved = {
      ...dynamicRoute('/moved'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/gone' as never);
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [moved],
    });
    const utils = makeUtils();

    const err = await handleRequest(rscInput(encodeRoutePath('/moved')), utils)
      // the client leaves for /gone, which answers for itself
      .catch((e: unknown) => e);

    expect(unstable_getErrorInfo(err)).toEqual({
      status: 307,
      location: '/gone',
    });
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it('hands off a server-function redirect whose destination is not found', async () => {
    const gone = {
      ...dynamicRoute('/dest'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_notFound();
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [gone, dynamicRoute('/404')],
    });
    const utils = makeUtils();
    const err = await handleRequest(
      callInput(async () => {
        unstable_redirect('/dest');
      }),
      utils,
    ).catch((e: unknown) => e);
    // the browser still lands on /dest, which renders its own 404 there
    expect(unstable_getErrorInfo(err)).toEqual({
      status: 307,
      location: '/dest',
    });
  });

  it('hands off a server-function redirect whose destination redirects', async () => {
    const onward = {
      ...dynamicRoute('/dest'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          unstable_redirect('/onward' as never);
        },
      },
    };
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [onward],
    });
    const utils = makeUtils();
    const err = await handleRequest(
      callInput(async () => {
        unstable_redirect('/dest');
      }),
      utils,
    ).catch((e: unknown) => e);
    expect(unstable_getErrorInfo(err)).toEqual({
      status: 307,
      location: '/dest',
    });
  });

  it('renders the 404 route with the query that was asked for', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'http',
        pathname: '/nowhere',
        req: new Request('http://localhost/nowhere?foo=bar'),
      },
      utils,
    );
    // a client side 404 keeps the attempted query, so a direct load must too
    const elements = utils.renderRsc.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(elements?.ROUTE).toEqual(['/404', 'foo=bar']);
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
