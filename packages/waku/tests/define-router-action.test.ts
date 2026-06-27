import { describe, expect, it, vi } from 'vitest';
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import {
  ROUTE_ID,
  encodeRoutePath,
} from '../src/router/common-utils/route-path.js';
import {
  unstable_defineRouter,
  unstable_redirect,
  unstable_rerenderRoute,
} from '../src/router/define-router.js';

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

describe('define-router action requests', () => {
  it('does not let catch-all api routes intercept component requests', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api' as const,
          path: [
            { type: 'group' as const, name: 'bucket' },
            { type: 'wildcard' as const, name: 'path' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: 'about' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());

    await handleRequest(
      {
        type: 'component',
        pathname: '/RSC/R/about',
        rscPath: encodeRoutePath('/about'),
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/about'),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(apiHandler).not.toHaveBeenCalled();
    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/about', ''] }),
    );
  });

  it('does not let catch-all api routes intercept function requests', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const actionFn = vi.fn().mockResolvedValue('action-result');
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api' as const,
          path: [
            { type: 'group' as const, name: 'bucket' },
            { type: 'wildcard' as const, name: 'path' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());

    await handleRequest(
      {
        type: 'function',
        pathname: '/RSC/F/actions/submit.txt',
        fn: actionFn,
        args: ['arg'],
        req: new Request('http://localhost/RSC/F/actions/submit.txt', {
          method: 'POST',
        }),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(apiHandler).not.toHaveBeenCalled();
    expect(actionFn).toHaveBeenCalledWith('arg');
    expect(renderRsc).toHaveBeenCalledWith({}, { value: 'action-result' });
  });

  it('sets router initial route for 404 HTML', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: '404' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    const renderHtml = vi.fn().mockResolvedValue(new Response('ok'));

    await handleRequest(
      {
        type: 'custom',
        pathname: '/missing',
        req: new Request('http://localhost/missing'),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml,
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/404', ''] }),
    );
    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it('allows no-JS form actions to rerender a route', async () => {
    let message = 'before';
    const renderPage = vi.fn(() => `page:${message}`);
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {
            'page:/': { isStatic: false, renderer: renderPage },
          },
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    const renderHtml = vi.fn().mockResolvedValue(new Response('ok'));

    const res = await handleRequest(
      {
        type: 'action',
        fn: async () => {
          message = 'after';
          unstable_rerenderRoute('/');
          return 'form-state';
        },
        pathname: '/',
        req: new Request('http://localhost/', { method: 'POST' }),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml,
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(res).toBeInstanceOf(Response);
    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        'page:/': 'page:after',
      }),
    );
    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({
        formState: 'form-state',
      }),
    );
  });

  it('does not let catch-all api routes intercept no-JS form actions', async () => {
    let message = 'before';
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const renderPage = vi.fn(() => `page:${message}`);
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {
            'page:/': { isStatic: false, renderer: renderPage },
          },
        },
        {
          type: 'api' as const,
          path: [{ type: 'wildcard' as const, name: 'path' }],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    const renderHtml = vi.fn().mockResolvedValue(new Response('ok'));

    const res = await handleRequest(
      {
        type: 'action',
        fn: async () => {
          message = 'after';
          unstable_rerenderRoute('/');
          return 'form-state';
        },
        pathname: '/',
        req: new Request('http://localhost/', { method: 'POST' }),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml,
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(res).toBeInstanceOf(Response);
    expect(apiHandler).not.toHaveBeenCalled();
    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        'page:/': 'page:after',
      }),
    );
    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({
        formState: 'form-state',
      }),
    );
  });

  it('lets api routes handle action requests when no route matches', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const actionFn = vi.fn();
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'api' as const,
          path: [
            { type: 'literal' as const, name: 'api' },
            { type: 'literal' as const, name: 'form-data' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });

    const res = await handleRequest(
      {
        type: 'action',
        fn: actionFn,
        pathname: '/api/form-data',
        req: new Request('http://localhost/api/form-data', {
          method: 'POST',
        }),
      },
      {
        renderRsc: vi.fn(),
        parseRsc: vi.fn(),
        renderHtml: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(res).toBeInstanceOf(Response);
    expect(await (res as Response).text()).toBe('api');
    expect(apiHandler).toHaveBeenCalledTimes(1);
    expect(actionFn).not.toHaveBeenCalled();
  });
});

describe('unstable_redirect', () => {
  const getRedirectInfo = (location: string) => {
    try {
      unstable_redirect(location, 303);
    } catch (e) {
      return getErrorInfo(e);
    }
  };

  it('accepts pathname redirects', () => {
    expect(getRedirectInfo('/login?next=%2Fdashboard')).toEqual({
      status: 303,
      location: '/login?next=%2Fdashboard',
    });
  });

  it.each([
    'https://example.com/',
    '//example.com/',
    '/\\example.com/',
    'login',
    '/bad\npath',
    '/bad\x7fpath',
  ])('rejects invalid redirect location %s', (location) => {
    expect(() => unstable_redirect(location)).toThrow(
      'Invalid redirect location',
    );
  });

  // The structured form serializes server-side via buildRouteHref; `to` is cast
  // because this test file declares no routes (RouteSearch<string> is `never`).
  const getStructuredRedirectInfo = (to: unknown) => {
    try {
      unstable_redirect(to as never, 303);
    } catch (e) {
      return getErrorInfo(e);
    }
  };

  it('serializes a structured target with params', () => {
    expect(
      getStructuredRedirectInfo({
        to: '/posts/[slug]',
        params: { slug: 'hello world' },
      }),
    ).toEqual({ status: 303, location: '/posts/hello%20world' });
  });

  // Search serialization needs the per-request router store (codec resolver),
  // so it is covered end to end by the create-pages e2e (/redirect-to-search).
});
