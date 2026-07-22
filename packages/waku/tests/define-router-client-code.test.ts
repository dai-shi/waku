import { afterEach, describe, expect, it } from 'vitest';
import { DEFINE_ROUTER_METADATA } from '../src/router/define-router-utils/build-metadata.js';
import {
  getRouterPrefetchCode,
  setupRouterSearchCodecs,
} from '../src/router/define-router-utils/client-code.js';
import type { RuntimeConfig } from '../src/router/define-router-utils/config-types.js';
import { pathSpecAsString } from '../src/router/isomorphic-utils/path-spec.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';

type Globals = {
  __WAKU_ROUTER_PREFETCH__?: (path: string, cb: (id: string) => void) => void;
  __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string>;
};
const globals = globalThis as Globals;

const literal = (name: string): PathSpec => [{ type: 'literal', name }];

const route = (opts: {
  path: PathSpec;
  pathPattern?: PathSpec;
  searchCodec?: { id: string };
}): RuntimeConfig =>
  ({ type: 'route', isStatic: false, ...opts }) as unknown as RuntimeConfig;

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
  delete globals.__WAKU_ROUTER_SEARCH_CODECS__;
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

describe('setupRouterSearchCodecs', () => {
  it('keys the map by pathPattern when present, otherwise path', () => {
    setupRouterSearchCodecs([
      route({
        path: literal('a'),
        pathPattern: literal('ap'),
        searchCodec: { id: 'ca' },
      }),
      route({ path: literal('b'), searchCodec: { id: 'cb' } }),
    ]);
    const map = globals.__WAKU_ROUTER_SEARCH_CODECS__!;
    expect(map[pathSpecAsString(literal('ap'))]).toBe('ca');
    expect(map[pathSpecAsString(literal('b'))]).toBe('cb');
    // the raw path of the pathPattern route is not used as a key
    expect(map[pathSpecAsString(literal('a'))]).toBeUndefined();
  });

  it('emits no script when no route has a search codec', () => {
    expect(setupRouterSearchCodecs([route({ path: literal('x') })])).toBe('');
    expect(globals.__WAKU_ROUTER_SEARCH_CODECS__).toBeUndefined();
  });

  it('escapes `<` in the inline JSON', () => {
    const script = setupRouterSearchCodecs([
      route({ path: literal('foo'), searchCodec: { id: 'c<x' } }),
    ]);
    expect(script).toContain('\\u003c');
    expect(script).not.toContain('<');
  });
});

describe('DEFINE_ROUTER_METADATA', () => {
  it('matches the persisted metadata keys exactly', () => {
    expect(DEFINE_ROUTER_METADATA).toStrictEqual({
      serializableConfigs: 'defineRouter:serializableConfigs',
      cachedElements: 'defineRouter:cachedElements',
      path2moduleIds: 'defineRouter:path2moduleIds',
    });
  });
});
