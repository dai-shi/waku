import { describe, expect, it, vi } from 'vitest';
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import {
  unstable_defineRouter,
  unstable_redirect,
  unstable_rerenderRoute,
} from '../src/router/define-router.js';

const requestContext = vi.hoisted(() => ({}));

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
  unstable_getContext: vi.fn(() => requestContext),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

describe('define-router action requests', () => {
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
});
