/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ROUTER_STATE_ID,
  getRouterState,
  getSettledRoute,
  makeRouterState,
  resolveServerRedirect,
} from '../src/router/client-utils/router-state.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const urlOf = (path: string) => new URL(path, window.location.origin);

const withRouterState = (
  elements: Record<string, unknown>,
  routerState: ReturnType<typeof makeRouterState>,
) => ({ ...elements, [ROUTER_STATE_ID]: routerState });

describe('makeRouterState', () => {
  test('captures the url, the requested route and the intents', () => {
    const routerState = makeRouterState(
      route('/a', 'x=1'),
      urlOf('/a?x=1#top'),
      {
        history: 'push',
        scroll: true,
        pathChanged: true,
        follows: 2,
      },
    );
    expect(routerState.url).toBe('/a?x=1#top');
    expect(routerState.requested).toEqual(['/a', 'x=1']);
    expect(routerState.history).toBe('push');
    expect(routerState.scroll).toEqual({ pathChanged: true });
    expect(routerState.follows).toBe(2);
  });

  test('no scroll intent when scrolling is off', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a'), {
      history: 'replace',
      scroll: false,
      pathChanged: true,
      follows: 0,
    });
    expect(routerState.scroll).toBeNull();
  });
});

describe('getRouterState', () => {
  test('reads the state the record carries under the symbol', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a'), {
      history: 'push',
      scroll: false,
      pathChanged: false,
      follows: 0,
    });
    expect(getRouterState(withRouterState({}, routerState))).toBe(routerState);
    expect(getRouterState({})).toBeUndefined();
  });
});

describe('resolveServerRedirect', () => {
  test('a failed navigation reports the attempted route and url', () => {
    const attempted = makeRouterState(
      route('/next', 'b=2', '#bottom'),
      urlOf('/next?b=2#bottom'),
      {
        history: null,
        scroll: false,
        pathChanged: false,
        follows: 0,
      },
    );
    const { route: resolvedRoute, url } = resolveServerRedirect(
      { [ROUTE_ID]: ['/start', 'a=1'] },
      {
        ...attempted,
        failedFrom: route('/start', 'a=1', '#top'),
      },
      '/f',
    );

    expect(resolvedRoute).toEqual(route('/next', 'b=2', '#bottom'));
    expect(url.href).toBe(urlOf('/next?b=2#bottom').href);
  });

  test('path from the elements, query and hash from the routerState url', () => {
    const routerState = makeRouterState(
      route('/a', 'x=1'),
      urlOf('/a?x=1#top'),
      {
        history: 'replace',
        scroll: false,
        pathChanged: false,
        follows: 0,
      },
    );
    const elements = { [ROUTE_ID]: ['/a', 'x=1'] };
    const { route: resolvedRoute, url } = resolveServerRedirect(
      elements,
      routerState,
      '/f',
    );
    expect(resolvedRoute).toEqual(route('/a', 'x=1', '#top'));
    expect(url.pathname).toBe('/a');
  });

  test('a static response does not echo the query; the routerState url keeps it', () => {
    const routerState = makeRouterState(route('/a', 'x=1'), urlOf('/a?x=1'), {
      history: 'replace',
      scroll: false,
      pathChanged: false,
      follows: 0,
    });
    const elements = { [ROUTE_ID]: ['/a', ''], [IS_STATIC_ID]: true };
    const { route: resolvedRoute, url } = resolveServerRedirect(
      elements,
      routerState,
      '/f',
    );
    expect(resolvedRoute.query).toBe('x=1');
    expect(url.search).toBe('?x=1');
  });

  test('a server redirect moves the route and the url', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a'), {
      history: 'push',
      scroll: false,
      pathChanged: true,
      follows: 0,
    });
    const elements = { [ROUTE_ID]: ['/b', 'y=2'] };
    const { route: resolvedRoute, url } = resolveServerRedirect(
      elements,
      routerState,
      '/f',
    );
    expect(resolvedRoute).toEqual(route('/b', 'y=2'));
    expect(url.pathname).toBe('/b');
    expect(url.search).toBe('?y=2');
  });

  test('a server redirect keeps the base path in the url', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      const routerState = makeRouterState(route('/a'), urlOf('/docs/a'), {
        history: 'replace',
        scroll: false,
        pathChanged: false,
        follows: 0,
      });
      const elements = { [ROUTE_ID]: ['/b', ''] };
      const { url } = resolveServerRedirect(elements, routerState, '/f');
      expect(url.pathname).toBe('/docs/b');
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a server redirect to the 404 route keeps the requested url', () => {
    const routerState = makeRouterState(route('/missing'), urlOf('/missing'), {
      history: 'replace',
      scroll: false,
      pathChanged: true,
      follows: 0,
    });
    const elements = { [ROUTE_ID]: ['/404', ''] };
    const { route: resolvedRoute, url } = resolveServerRedirect(
      elements,
      routerState,
      '/f',
    );
    expect(resolvedRoute.path).toBe('/404');
    expect(url.pathname).toBe('/missing');
  });
});

describe('getSettledRoute', () => {
  const fallback = route('/f', '', '#restored');

  test('the fallback until a navigation has landed', () => {
    expect(getSettledRoute({}, fallback)).toEqual(fallback);
  });

  test('a landed navigation resolves the server redirect', () => {
    const routerState = makeRouterState(route('/a'), urlOf('/a#top'), {
      history: 'push',
      scroll: true,
      pathChanged: true,
      follows: 0,
    });
    const elements = withRouterState(
      { [ROUTE_ID]: ['/b', 'y=2'] },
      routerState,
    );
    expect(getSettledRoute(elements, fallback)).toEqual(route('/b', 'y=2'));
  });

  test('a failed navigation keeps the last settled route', () => {
    const settledRoute = route('/a', 'x=1', '#top');
    const routerState = makeRouterState(route('/b'), urlOf('/b?y=2#bottom'), {
      history: null,
      scroll: false,
      pathChanged: false,
      follows: 0,
    });
    const elements = withRouterState(
      { [ROUTE_ID]: ['/a', 'x=1'] },
      { ...routerState, failedFrom: settledRoute },
    );

    expect(getSettledRoute(elements, fallback)).toEqual(settledRoute);
  });
});
