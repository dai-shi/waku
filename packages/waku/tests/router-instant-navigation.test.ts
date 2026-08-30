/** @vitest-environment happy-dom */
import { describe, expect, test } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  canPaintInstantOverlay,
  pinForSwr,
} from '../src/router/client-utils/instant-navigation.js';
import { ROUTER_STATE_ID } from '../src/router/client-utils/router-state.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

const immutable = (slotId: string) => ({
  [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
});

describe('canPaintInstantOverlay', () => {
  const route = { path: '/a', query: '', hash: '' };

  test('uses an immutable route shell only on the first attempt', () => {
    const elements = immutable(getRouteSlotId(route.path));
    expect(canPaintInstantOverlay(0, route, elements)).toBe(true);
    expect(canPaintInstantOverlay(1, route, elements)).toBe(false);
  });
});

describe('pinForSwr', () => {
  test('pins meta keys and immutable slots, not mutable ones', () => {
    const pin = pinForSwr(() => immutable('layout:/'));
    expect(pin(ROUTE_ID)).toBe(true);
    expect(pin(HAS404_ID)).toBe(true);
    expect(pin(IS_STATIC_ID)).toBe(true);
    // a legacy-style prefix is not meta; only the exact IS_STATIC key is
    expect(pin(`${IS_STATIC_ID}:layout:/`)).toBe(false);
    // the client's own state rides the merge instead of becoming a hole
    expect(pin(ROUTER_STATE_ID)).toBe(true);
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
