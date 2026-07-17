/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import {
  deriveCommitted,
  resolveFollowingErrors,
} from '../src/router/client-utils/navigate.js';
import type { ResolveDeps } from '../src/router/client-utils/navigate.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const route = (path: string, query = '') => ({ path, query, hash: '' });

const makeDeps = (
  responses: (
    | { reject: { status: number; location?: string } }
    | { resolve: Record<string, unknown> }
  )[],
  overrides?: Partial<ResolveDeps>,
) => {
  const fetchRoute = vi.fn<ResolveDeps['fetchRoute']>();
  for (const response of responses) {
    if ('reject' in response) {
      fetchRoute.mockImplementationOnce(() =>
        Promise.reject(createCustomError('follow-error', response.reject)),
      );
    } else {
      fetchRoute.mockResolvedValueOnce(response.resolve);
    }
  }
  const leaveApp = vi.fn();
  const deps: ResolveDeps = {
    fetchRoute,
    isKnownStatic: () => false,
    has404: true,
    isAborted: () => false,
    leaveApp,
    ...overrides,
  };
  return { deps, fetchRoute, leaveApp };
};

const urlOf = (path: string) => new URL(path, window.location.origin);

describe('navigator', () => {
  test('resolves a redirect chain to its destination', async () => {
    const { deps, fetchRoute } = makeDeps([
      { reject: { status: 307, location: '/b' } },
      { reject: { status: 307, location: '/c' } },
      { resolve: { data: 'c' } },
    ]);
    const destination = await resolveFollowingErrors(
      deps,
      route('/a'),
      urlOf('/a'),
      route('/start'),
      undefined,
    );
    expect(fetchRoute).toHaveBeenCalledTimes(3);
    expect(destination?.route.path).toBe('/c');
    expect(destination?.routeUrl.pathname).toBe('/c');
  });

  test('a 404 keeps the attempted url while resolving the 404 route', async () => {
    const { deps } = makeDeps([
      { reject: { status: 404 } },
      { resolve: { data: '404' } },
    ]);
    const destination = await resolveFollowingErrors(
      deps,
      route('/missing'),
      urlOf('/missing'),
      route('/start'),
      undefined,
    );
    expect(destination?.route.path).toBe('/404');
    expect(destination?.routeUrl.pathname).toBe('/missing');
  });

  test('a cycle stops at the hop limit with the cause attached', async () => {
    const { deps, fetchRoute } = makeDeps([]);
    fetchRoute.mockImplementation(() =>
      Promise.reject(
        createCustomError('follow-error', { status: 307, location: '/a' }),
      ),
    );
    await expect(
      resolveFollowingErrors(
        deps,
        route('/a'),
        urlOf('/a'),
        route('/start'),
        undefined,
      ),
    ).rejects.toThrow('too many redirect or 404 follows');
    expect(fetchRoute).toHaveBeenCalledTimes(21);
  });

  test('a known static follow target resolves without fetching', async () => {
    const { deps, fetchRoute } = makeDeps(
      [{ reject: { status: 307, location: '/static-page' } }],
      { isKnownStatic: (path: string) => path === '/static-page' },
    );
    const destination = await resolveFollowingErrors(
      deps,
      route('/a'),
      urlOf('/a'),
      route('/start'),
      undefined,
    );
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(destination?.route.path).toBe('/static-page');
    expect(destination?.elements).toBeUndefined();
  });

  test('a cross origin redirect leaves through the app, not directly', async () => {
    const { deps, fetchRoute, leaveApp } = makeDeps([
      { reject: { status: 307, location: 'https://auth.example.com/login' } },
    ]);
    const destination = await resolveFollowingErrors(
      deps,
      route('/protected'),
      urlOf('/protected'),
      route('/dashboard'),
      undefined,
    );
    expect(destination).toBeUndefined();
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(leaveApp).toHaveBeenCalledWith(
      new URL('https://auth.example.com/login'),
    );
  });
});

describe('deriveCommitted', () => {
  const getServerRedirect = () => undefined;

  test('a plain navigation keeps its history and scroll intent', () => {
    const committed = deriveCommitted({
      destination: {
        route: route('/next'),
        routeUrl: urlOf('/next'),
      },
      attempted: route('/next'),
      routeBefore: route('/start'),
      history: 'push',
      historyUrl: urlOf('/next'),
      shouldScroll: true,
      getServerRedirect,
    });
    expect(committed.route.path).toBe('/next');
    expect(committed.history).toEqual({
      mode: 'push',
      url: urlOf('/next'),
    });
    expect(committed.scroll).toEqual({ pathChanged: true });
  });

  test('a followed navigation replaces the history url', () => {
    const committed = deriveCommitted({
      destination: {
        route: route('/login'),
        routeUrl: urlOf('/login'),
      },
      attempted: route('/protected'),
      routeBefore: route('/start'),
      history: 'push',
      historyUrl: urlOf('/protected'),
      shouldScroll: true,
      getServerRedirect,
    });
    expect(committed.history?.url?.pathname).toBe('/login');
  });

  test('a server side redirect to the 404 route drops the history write', () => {
    const committed = deriveCommitted({
      destination: {
        route: route('/somewhere'),
        routeUrl: urlOf('/somewhere'),
        elements: {},
      },
      attempted: route('/somewhere'),
      routeBefore: route('/start'),
      history: 'push',
      historyUrl: urlOf('/somewhere'),
      shouldScroll: false,
      getServerRedirect: () => route('/404'),
    });
    expect(committed.route.path).toBe('/404');
    expect(committed.history).toBeNull();
    expect(committed.scroll).toBeNull();
  });
});
