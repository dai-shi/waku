/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { resolveErrorRoute } from '../src/router/client-utils/error-route.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const requested = (href: string) => new URL(href, window.location.href);

describe('resolveErrorRoute', () => {
  test('a document location leaves, whatever its origin', () => {
    const sameOrigin = createCustomError('document navigation', {
      location: '/api/logout',
      unstable_leave: true,
    });
    const other = createCustomError('document navigation', {
      location: 'https://other.example/next',
      unstable_leave: true,
    });

    // the server already decided no route answers it
    expect(resolveErrorRoute(sameOrigin, requested('/from'), false)).toEqual({
      type: 'leave',
      url: expect.any(URL),
    });
    expect(
      resolveErrorRoute(other, requested('/from'), false).type === 'leave',
    ).toBe(true);
  });

  test('an app path redirect keeps the route and rebuilds its url', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: '/next?a=1#frag',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute).toEqual({
      type: 'route',
      target: { path: '/next', query: 'a=1', hash: '#frag' },
      url: expect.any(URL),
    });
    expect(errorRoute.type === 'route' && errorRoute.url.pathname).toBe(
      '/next',
    );
  });

  test('a base path is added back to an app path redirect', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    const error = createCustomError('redirect', {
      status: 307,
      location: '/next',
    });

    const errorRoute = resolveErrorRoute(error, requested('/docs/from'), false);

    expect(errorRoute.type === 'route' && errorRoute.target.path).toBe('/next');
    expect(errorRoute.type === 'route' && errorRoute.url.pathname).toBe(
      '/docs/next',
    );
  });

  test('a same origin url is followed as it is', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: `${window.location.origin}/next`,
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute.type === 'route' && errorRoute.target.path).toBe('/next');
  });

  test('another origin leaves the app', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'https://example.com/next',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute).toEqual({ type: 'leave', url: expect.any(URL) });
    expect(errorRoute.type === 'leave' && errorRoute.url.href).toBe(
      'https://example.com/next',
    );
  });

  test('a protocol-relative location belongs to another origin', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: '//example.com/next',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute.type).toBe('leave');
  });

  test('credentials never reach the address bar', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'https://user:pw@example.com/next',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute.type === 'leave' && errorRoute.url.href).toBe(
      'https://example.com/next',
    );
  });

  test('this host named over plaintext keeps the scheme the page is on', () => {
    const secure = 'https://app.example';
    (window as any).happyDOM.setURL(secure + '/from');
    try {
      const error = createCustomError('redirect', {
        // what an app builds from a request url behind an https proxy
        status: 307,
        location: 'http://app.example/next',
      });

      const errorRoute = resolveErrorRoute(error, requested('/from'), false);

      expect(errorRoute.type).toBe('route');
      expect(errorRoute.type === 'route' && errorRoute.url.protocol).toBe(
        'https:',
      );
    } finally {
      (window as any).happyDOM.setURL('http://localhost:3000/');
    }
  });

  test('a location the browser should not navigate to cannot be followed', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'javascript:alert(1)',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute).toEqual({
      type: 'unfollowable',
      location: 'javascript:alert(1)',
    });
  });

  test('an unfollowable location does not carry credentials into the message', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'ftp://user:pw@host/x',
    });

    expect(resolveErrorRoute(error, requested('/from'), false)).toEqual({
      type: 'unfollowable',
      location: 'ftp://host/x',
    });
  });

  test('a location that is not a url cannot be followed either', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'https://[',
    });

    const errorRoute = resolveErrorRoute(error, requested('/from'), false);

    expect(errorRoute).toEqual({
      type: 'unfollowable',
      location: 'https://[',
    });
  });

  test('a 404 goes to the 404 route with the requested query and url', () => {
    const error = createCustomError('nf', { status: 404 });

    const errorRoute = resolveErrorRoute(
      error,
      requested('/missing?foo=bar'),
      true,
    );

    expect(errorRoute.type === 'route' && errorRoute.target).toEqual({
      path: '/404',
      query: 'foo=bar',
      hash: '',
    });
    expect(errorRoute.type === 'route' && errorRoute.url.pathname).toBe(
      '/missing',
    );
  });

  test('a 404 without a 404 route is not followed', () => {
    const error = createCustomError('nf', { status: 404 });

    expect(resolveErrorRoute(error, requested('/missing'), false)).toEqual({
      type: 'none',
    });
  });

  test('a plain error is not followed', () => {
    expect(
      resolveErrorRoute(new Error('boom'), requested('/from'), true),
    ).toEqual({
      type: 'none',
    });
  });
  test('a same origin url outside the base path leaves', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    const error = createCustomError('redirect', {
      status: 307,
      location: `${window.location.origin}/login`,
    });
    expect(resolveErrorRoute(error, requested('/docs/from'), false).type).toBe(
      'leave',
    );
  });
});
