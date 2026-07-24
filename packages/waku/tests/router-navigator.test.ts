/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  NAV_ID,
  canCommitInstantly,
  deriveCommitted,
  getNavState,
  makeNavState,
  pinForSwr,
} from '../src/router/client-utils/navigate.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const urlOf = (path: string) => new URL(path, window.location.origin);

const withNav = (
  elements: Record<string, unknown>,
  nav: ReturnType<typeof makeNavState>,
) => ({ ...elements, [NAV_ID]: nav });

describe('makeNavState', () => {
  test('captures the url, the attempted route and the intents', () => {
    const nav = makeNavState(route('/a', 'x=1'), urlOf('/a?x=1#top'), {
      push: true,
      scroll: true,
      pathChanged: true,
    });
    expect(nav.url).toBe('/a?x=1#top');
    expect(nav.attempted).toEqual(['/a', 'x=1']);
    expect(nav.push).toBe(true);
    expect(nav.scroll).toEqual({ pathChanged: true });
    expect(nav.scrollIntent).toBe(true);
  });

  test('no scroll intent when scrolling is off', () => {
    const nav = makeNavState(route('/a'), urlOf('/a'), {
      push: false,
      scroll: false,
      pathChanged: true,
    });
    expect(nav.scroll).toBeNull();
    expect(nav.scrollIntent).toBe(false);
  });
});

describe('deriveCommitted', () => {
  test('falls back to the given route without nav state', () => {
    const {
      route: derived,
      nav,
      url,
    } = deriveCommitted({ [ROUTE_ID]: ['/a', ''] }, route('/fallback'));
    expect(derived).toEqual(route('/fallback'));
    expect(nav).toBeUndefined();
    expect(url).toBeUndefined();
  });

  test('path from the elements, query and hash from the nav url', () => {
    const nav = makeNavState(route('/a', 'x=1'), urlOf('/a?x=1#top'), {
      push: false,
      scroll: false,
      pathChanged: false,
    });
    const elements = withNav({ [ROUTE_ID]: ['/a', 'x=1'] }, nav);
    const { route: derived, url } = deriveCommitted(elements, route('/f'));
    expect(derived).toEqual(route('/a', 'x=1', '#top'));
    expect(url?.pathname).toBe('/a');
    expect(getNavState(elements)).toBe(nav);
  });

  test('a static response does not echo the query; the nav url keeps it', () => {
    const nav = makeNavState(route('/a', 'x=1'), urlOf('/a?x=1'), {
      push: false,
      scroll: false,
      pathChanged: false,
    });
    const elements = withNav(
      { [ROUTE_ID]: ['/a', ''], [IS_STATIC_ID]: true },
      nav,
    );
    const { route: derived, url } = deriveCommitted(elements, route('/f'));
    expect(derived.query).toBe('x=1');
    expect(url?.search).toBe('?x=1');
  });

  test('a server redirect moves the route and the url', () => {
    const nav = makeNavState(route('/a'), urlOf('/a'), {
      push: true,
      scroll: false,
      pathChanged: true,
    });
    const elements = withNav({ [ROUTE_ID]: ['/b', 'y=2'] }, nav);
    const { route: derived, url } = deriveCommitted(elements, route('/f'));
    expect(derived).toEqual(route('/b', 'y=2'));
    expect(url?.pathname).toBe('/b');
    expect(url?.search).toBe('?y=2');
  });

  test('a server redirect keeps the base path in the url', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    try {
      const nav = makeNavState(route('/a'), urlOf('/docs/a'), {
        push: false,
        scroll: false,
        pathChanged: false,
      });
      const elements = withNav({ [ROUTE_ID]: ['/b', ''] }, nav);
      const { url } = deriveCommitted(elements, route('/f'));
      expect(url?.pathname).toBe('/docs/b');
    } finally {
      vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
    }
  });

  test('a server redirect to the 404 route keeps the attempted url', () => {
    const nav = makeNavState(route('/missing'), urlOf('/missing'), {
      push: false,
      scroll: false,
      pathChanged: true,
    });
    const elements = withNav({ [ROUTE_ID]: ['/404', ''] }, nav);
    const { route: derived, url } = deriveCommitted(elements, route('/f'));
    expect(derived.path).toBe('/404');
    expect(url?.pathname).toBe('/missing');
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
