/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { resolveErrorRoute } from '../src/router/client-utils/error-route.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const attempted = (href: string) => new URL(href, window.location.href);

describe('resolveErrorRoute', () => {
  test('an app path redirect keeps the route and rebuilds its url', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: '/next?a=1#frag',
    });

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

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

    const errorRoute = resolveErrorRoute(error, attempted('/docs/from'), false);

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

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

    expect(errorRoute.type === 'route' && errorRoute.target.path).toBe('/next');
  });

  test('a same origin url from a redirected response is left to the browser', () => {
    const error = createCustomError('redirected rsc request', {
      status: 307,
      location: `${window.location.origin}/next`,
      unstable_redirected: true,
    });

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

    expect(errorRoute.type).toBe('leave');
    expect(errorRoute.type === 'leave' && errorRoute.url.pathname).toBe(
      '/next',
    );
  });

  test('another origin leaves the app', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'https://example.com/next',
    });

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

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

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

    expect(errorRoute.type).toBe('leave');
  });

  test('a location the browser should not navigate to cannot be followed', () => {
    const error = createCustomError('redirect', {
      status: 307,
      location: 'javascript:alert(1)',
    });

    const errorRoute = resolveErrorRoute(error, attempted('/from'), false);

    expect(errorRoute).toEqual({
      type: 'unfollowable',
      location: 'javascript:alert(1)',
    });
  });

  test('a 404 goes to the 404 route with the attempted query and url', () => {
    const error = createCustomError('nf', { status: 404 });

    const errorRoute = resolveErrorRoute(
      error,
      attempted('/missing?foo=bar'),
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

    expect(resolveErrorRoute(error, attempted('/missing'), false)).toEqual({
      type: 'none',
    });
  });

  test('a plain error is not followed', () => {
    expect(
      resolveErrorRoute(new Error('boom'), attempted('/from'), true),
    ).toEqual({
      type: 'none',
    });
  });
});
