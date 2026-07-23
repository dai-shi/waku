/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  applyServerRedirect,
  canCommitInstantly,
  deriveNav,
  pinForSwr,
  resolveFollowingErrors,
} from '../src/router/client-utils/navigate.js';
import type { ResolveDeps } from '../src/router/client-utils/navigate.js';
import { ROUTE_ID } from '../src/router/isomorphic-utils/route-path.js';

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

describe('deriveNav', () => {
  const getServerRedirect = () => undefined;

  test('a plain navigation keeps its history and scroll intent', () => {
    const { route: derived, nav } = deriveNav({
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
    expect(derived.path).toBe('/next');
    expect(nav.history).toEqual({
      mode: 'push',
      url: urlOf('/next'),
    });
    expect(nav.scroll).toEqual({ pathChanged: true });
  });

  test('a followed navigation replaces the history url', () => {
    const { nav } = deriveNav({
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
    expect(nav.history?.url?.pathname).toBe('/login');
  });

  test('a server side redirect to the 404 route drops the history write', () => {
    const { route: derived, nav } = deriveNav({
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
    expect(derived.path).toBe('/404');
    expect(nav.history).toBeNull();
    expect(nav.scroll).toBeNull();
  });
});

describe('canCommitInstantly', () => {
  const immutable = (slotId: string) => ({
    [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
  });

  test('true when the resolved elements hold an immutable route slot', () => {
    expect(
      canCommitInstantly('route:/a', immutable('route:/a'), undefined),
    ).toBe(true);
  });

  test('true when only the prefetched elements hold it', () => {
    expect(canCommitInstantly('route:/a', {}, immutable('route:/a'))).toBe(
      true,
    );
  });

  test('false without an immutable etag for the slot', () => {
    expect(
      canCommitInstantly(
        'route:/a',
        { [ETAG_ID_PREFIX + 'route:/a']: 'W/"mutable"' },
        null,
      ),
    ).toBe(false);
  });
});

describe('pinForSwr', () => {
  const immutable = (slotId: string) => ({
    [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
  });

  test('pins meta keys and immutable slots, not mutable ones', () => {
    const pin = pinForSwr(() => immutable('layout:/'));
    expect(pin(ROUTE_ID)).toBe(true);
    expect(pin('layout:/')).toBe(true);
    expect(pin('page:/a')).toBe(false);
  });

  test('reads the resolved elements at call time', () => {
    let resolved: Record<string, unknown> = {};
    const pin = pinForSwr(() => resolved);
    expect(pin('layout:/')).toBe(false);
    resolved = immutable('layout:/');
    expect(pin('layout:/')).toBe(true);
  });
});

describe('applyServerRedirect', () => {
  const prev = {
    query: '',
    hash: '',
    history: { mode: 'push', url: undefined },
    scroll: { pathChanged: true },
  } as const;

  test('replaces history with the redirect url and keeps the scroll intent', () => {
    const next = applyServerRedirect(prev, route('/b', 'x=1'));
    expect(next.query).toBe('x=1');
    expect(next.history?.mode).toBe('replace');
    expect(next.history?.url?.pathname).toBe('/b');
    expect(next.scroll).toEqual({ pathChanged: true });
  });

  test('drops the history write for the 404 route', () => {
    const next = applyServerRedirect(prev, route('/404'));
    expect(next.history).toBeNull();
  });
});
