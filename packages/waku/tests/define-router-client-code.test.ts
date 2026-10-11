import { afterEach, describe, expect, it } from 'vitest';
import { CREATE_PAGES_CONFIGS_KEY } from '../src/router/create-pages-utils/config.js';
import { getRouterPrefetchCode } from '../src/router/define-router-utils/client-code.js';

type Globals = {
  __WAKU_ROUTER_PREFETCH__?: (path: string, cb: (id: string) => void) => void;
};
const globals = globalThis as Globals;

// The generated prefetch code assigns globalThis.__WAKU_ROUTER_PREFETCH__.
const runPrefetch = (code: string) => {
  new Function(code)();
  const fn = globals.__WAKU_ROUTER_PREFETCH__!;
  return (path: string) => {
    const ids: string[] = [];
    fn(path, (id) => ids.push(id));
    return ids;
  };
};

afterEach(() => {
  delete globals.__WAKU_ROUTER_PREFETCH__;
});

describe('getRouterPrefetchCode', () => {
  it('deduplicates module ids while preserving per-route mappings', () => {
    const code = getRouterPrefetchCode({
      '/a': ['m1', 'm2'],
      '/b': ['m2', 'm3'],
    });
    // ids are deduped to a single shared list
    expect(code).toContain('["m1","m2","m3"]');
    const prefetch = runPrefetch(code);
    expect(prefetch('/a')).toEqual(['m1', 'm2']);
    expect(prefetch('/b')).toEqual(['m2', 'm3']);
  });

  it('emits no ids for a path with no matching pattern', () => {
    const prefetch = runPrefetch(getRouterPrefetchCode({ '/a': ['m1'] }));
    expect(prefetch('/no-match')).toEqual([]);
  });
});

describe('CREATE_PAGES_CONFIGS_KEY', () => {
  it('matches the persisted metadata key exactly', () => {
    expect(CREATE_PAGES_CONFIGS_KEY).toBe('createPages:serializableConfigs');
  });
});
