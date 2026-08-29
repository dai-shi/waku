import { describe, expect, it, test } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  canCommitInstantly,
  getRouteFromElements,
  has404FromElements,
  isMetaKey,
  isStaticFromElements,
} from '../src/router/client-core-utils/element-meta.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

describe('element-meta', () => {
  it('reads route, static, and 404 from elements', () => {
    const elements = {
      [ROUTE_ID]: ['/about', 'q=1'],
      [IS_STATIC_ID]: true,
      [HAS404_ID]: true,
    };
    expect(getRouteFromElements(elements)).toEqual({
      path: '/about',
      query: 'q=1',
      hash: '',
    });
    expect(isStaticFromElements(elements)).toBe(true);
    expect(has404FromElements(elements)).toBe(true);
  });

  it('treats missing meta as undefined / false', () => {
    expect(getRouteFromElements({})).toBeUndefined();
    expect(isStaticFromElements({})).toBe(false);
    expect(has404FromElements({})).toBe(false);
  });

  it('isMetaKey matches ROUTE_ID, IS_STATIC_ID, HAS404_ID', () => {
    expect(isMetaKey(ROUTE_ID)).toBe(true);
    expect(isMetaKey(IS_STATIC_ID)).toBe(true);
    expect(isMetaKey(HAS404_ID)).toBe(true);
    expect(isMetaKey('page:index')).toBe(false);
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
