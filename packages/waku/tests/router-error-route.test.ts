/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import {
  decideFollow,
  resolveErrorRoute,
} from '../src/router/client-utils/error-route.js';

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

describe('decideFollow', () => {
  const options = { has404: false, maxFollows: 20 };
  const at = (path: string, query = '', follows = 0) => ({
    route: { path, query },
    url: requested(path + (query && `?${query}`)),
    follows,
  });
  const redirectTo = (location: string) =>
    createCustomError('redirect', { status: 307, location });

  test('an error that points nowhere decides nothing', () => {
    expect(decideFollow(new Error('offline'), at('/from'), options)).toEqual({
      type: 'none',
    });
  });

  test('a missing route only follows when the app has a 404 route', () => {
    const error = createCustomError('not found', { status: 404 });

    expect(decideFollow(error, at('/missing'), options)).toEqual({
      type: 'none',
    });
    expect(
      decideFollow(error, at('/missing'), { ...options, has404: true }),
    ).toEqual({
      type: 'follow',
      target: { path: '/404', query: '', hash: '' },
      url: expect.any(URL),
    });
  });

  test('a location the router cannot route to stops', () => {
    const error = redirectTo('javascript:alert(1)');

    expect(decideFollow(error, at('/from'), options)).toMatchObject({
      type: 'stop',
      error: {
        message: 'cannot follow a redirect to javascript:alert(1)',
        cause: error,
      },
    });
  });

  test('a redirect off the origin leaves', () => {
    expect(
      decideFollow(redirectTo('https://other.example/next'), at('/from'), {
        ...options,
        has404: true,
      }),
    ).toEqual({ type: 'leave', url: expect.any(URL) });
  });

  test('a redirect back to the route being fetched stops as a loop', () => {
    expect(
      decideFollow(redirectTo('/here'), at('/here'), options),
    ).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });

  test('the same path with a different query is not a loop', () => {
    expect(
      decideFollow(redirectTo('/here?page=2'), at('/here'), options),
    ).toMatchObject({
      type: 'follow',
      target: { path: '/here', query: 'page=2' },
    });
  });

  test('the same path with only a different hash is not a loop', () => {
    expect(
      decideFollow(redirectTo('/here#section'), at('/here'), options),
    ).toMatchObject({
      type: 'follow',
      target: { path: '/here', query: '', hash: '#section' },
    });
  });

  test('the last follow inside the budget goes through and the next one stops', () => {
    const error = redirectTo('/next');

    expect(decideFollow(error, at('/from', '', 19), options).type).toBe(
      'follow',
    );
    expect(decideFollow(error, at('/from', '', 20), options)).toMatchObject({
      type: 'stop',
      error: { message: 'too many redirect or 404 follows' },
    });
  });

  test('a loop is reported ahead of a spent budget', () => {
    expect(
      decideFollow(redirectTo('/here'), at('/here', '', 20), options),
    ).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });
});
