import { describe, expect, it } from 'vitest';
import { ETAG_ID_PREFIX } from '../src/lib/utils/etags.js';
import { buildMergePatch } from '../src/router/client-core-utils/merge-patch.js';
import { ROUTER_STATE_ID } from '../src/router/client-utils/router-state.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const loaded = (path: string, elements: Record<string, unknown>) => ({
  route: route(path),
  elements,
});

describe('buildMergePatch', () => {
  it('copies a key still identical in current and base', () => {
    const slot = getRouteSlotId('/next');
    const base = { shared: 'old', [slot]: 'start' };
    const current = { ...base };
    const patch = buildMergePatch(
      loaded('/next', { shared: 'new', [slot]: 'next' }),
      current,
      base,
      { settled: route('/start') },
    );
    expect(patch.shared).toBe('new');
  });

  it('skips a key a server action changed while the fetch waited', () => {
    const base = { shared: 'old' };
    const current = { shared: 'action' };
    const patch = buildMergePatch(
      loaded('/next', { shared: 'response' }),
      current,
      base,
      { settled: route('/start') },
    );
    expect(patch.shared).toBeUndefined();
  });

  it('skips a key that appeared or disappeared in current vs base', () => {
    const patchAdded = buildMergePatch(
      loaded('/next', { extra: 1 }),
      { extra: 'now' },
      {},
      { settled: route('/start') },
    );
    expect(patchAdded.extra).toBeUndefined();

    const patchRemoved = buildMergePatch(
      loaded('/next', { extra: 1 }),
      {},
      { extra: 'was' },
      { settled: route('/start') },
    );
    expect(patchRemoved.extra).toBeUndefined();
  });

  it('always lands the new route slot and etag when the rsc route changed', () => {
    const slot = getRouteSlotId('/next');
    const etag = ETAG_ID_PREFIX + slot;
    const base = { [slot]: 'start', [etag]: 'v1' };
    const current = { [slot]: 'action', [etag]: 'v-action' };
    const patch = buildMergePatch(
      loaded('/next', { [slot]: 'next', [etag]: 'v2' }),
      current,
      base,
      { settled: route('/start') },
    );
    expect(patch[slot]).toBe('next');
    expect(patch[etag]).toBe('v2');
  });

  it('does not force the route slot when the rsc route is unchanged', () => {
    const slot = getRouteSlotId('/start');
    const base = { [slot]: 'old' };
    const current = { [slot]: 'action' };
    const patch = buildMergePatch(
      loaded('/start', {
        [ROUTE_ID]: ['/start', ''],
        [slot]: 'response',
      }),
      current,
      base,
      { settled: route('/start') },
    );
    expect(patch[slot]).toBeUndefined();
  });

  it('always copies route meta from the response when present', () => {
    const base = { [ROUTE_ID]: ['/start', ''], [IS_STATIC_ID]: false };
    const current = { [ROUTE_ID]: ['/start', ''], [IS_STATIC_ID]: true };
    const patch = buildMergePatch(
      loaded('/next', {
        [ROUTE_ID]: ['/next', 'q=1'],
        [HAS404_ID]: true,
        [IS_STATIC_ID]: false,
      }),
      current,
      base,
      { settled: route('/start') },
    );
    expect(patch[ROUTE_ID]).toEqual(['/next', 'q=1']);
    expect(patch[HAS404_ID]).toBe(true);
    expect(patch[IS_STATIC_ID]).toBe(false);
    expect(Reflect.ownKeys(patch)).toEqual([HAS404_ID, ROUTE_ID, IS_STATIC_ID]);
  });

  it('omits meta keys the response did not send', () => {
    const patch = buildMergePatch(
      loaded('/next', { page: 1 }),
      { page: 1 },
      { page: 1 },
      { settled: route('/start') },
    );
    expect(ROUTE_ID in patch).toBe(false);
    expect(HAS404_ID in patch).toBe(false);
    expect(IS_STATIC_ID in patch).toBe(false);
  });

  it('does not write RouterState — that stays with the binding', () => {
    const patch = buildMergePatch(
      loaded('/next', { page: 1 }),
      { page: 1 },
      { page: 1 },
      { settled: route('/start') },
    );
    expect(ROUTER_STATE_ID in patch).toBe(false);
  });

  it('uses outcome.route for the slot when the response has no ROUTE_ID', () => {
    const slot = getRouteSlotId('/next');
    const patch = buildMergePatch(
      loaded('/next', { [slot]: 'next' }),
      { [slot]: 'start' },
      { [slot]: 'start' },
      { settled: route('/start') },
    );
    expect(patch[slot]).toBe('next');
  });
});
