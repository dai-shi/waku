// @vitest-environment happy-dom

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideFollow,
  isFollowable,
} from '../src/router/client-core-utils/error-route.js';
import * as clientCore from '../src/router/client-core.js';
import * as client from '../src/router/client.js';

const routerSrc = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/router',
);

const runtimeExportNames = (ns: object): string[] =>
  Reflect.ownKeys(ns)
    .filter((key): key is string => typeof key === 'string')
    .sort();

describe('waku/router/client-core surface', () => {
  test('runtime export names are the frozen L1 surface', () => {
    expect(runtimeExportNames(clientCore)).toEqual([
      'ErrorBoundary_UNSTABLE',
      'RouterHostContext_UNSTABLE',
      'SearchCodecsProvider_UNSTABLE',
      'Slice_UNSTABLE',
      'unstable_HAS404_ID',
      'unstable_IS_STATIC_ID',
      'unstable_MAX_FOLLOWS_PER_NAVIGATION',
      'unstable_ROUTE_ID',
      'unstable_buildMergePatch',
      'unstable_buildRouteHref',
      'unstable_canReuseStaticRoute',
      'unstable_clearCaches',
      'unstable_createRscParams',
      'unstable_decideFollow',
      'unstable_decodeRoutePath',
      'unstable_decodeSliceId',
      'unstable_encodeRoutePath',
      'unstable_encodeSliceId',
      'unstable_getComponentIds',
      'unstable_getPrefetch',
      'unstable_getPrefetchedElements',
      'unstable_getRouteFromElements',
      'unstable_getRouteSearchCodecId',
      'unstable_getRouteSlotId',
      'unstable_getRouteUrl',
      'unstable_getSliceSlotId',
      'unstable_has404FromElements',
      'unstable_hasCachedShell',
      'unstable_isCodec',
      'unstable_isFollowable',
      'unstable_isRouteSlotId',
      'unstable_isSameRoute',
      'unstable_isSameRscRoute',
      'unstable_isSliceSlotId',
      'unstable_isStaticFromElements',
      'unstable_learnStaticFromElements',
      'unstable_load',
      'unstable_matchRouteParams',
      'unstable_parseRoute',
      'unstable_pathnameToRoutePath',
      'unstable_prefetchRoute',
      'useHmrRefetch_UNSTABLE',
      'useInitialRoute_UNSTABLE',
      'useInitialRscParams_UNSTABLE',
      'useParams_UNSTABLE',
      'useResolveSearchCodec_UNSTABLE',
      'useRouterHost_UNSTABLE',
      'useSearch_UNSTABLE',
      'useSetSearch_UNSTABLE',
    ]);
  });

  test('unstable markers follow CONTRIBUTING.md', () => {
    const suffix = '_UNSTABLE';
    for (const name of runtimeExportNames(clientCore)) {
      if (name.endsWith(suffix)) {
        const base = name.slice(0, -suffix.length);
        expect(base.startsWith('use') || /^[A-Z]/.test(base), name).toBe(true);
      } else {
        expect(name.startsWith('unstable_'), name).toBe(true);
      }
    }
  });

  test('does not export binding-private names', () => {
    const names = new Set(runtimeExportNames(clientCore));
    expect(names.has('unstable_RouterContext')).toBe(false);
    expect(names.has('Router')).toBe(false);
    expect(names.has('Link')).toBe(false);
    expect(names.has('useRouter')).toBe(false);
    expect(names.has('changeRoute')).toBe(false);
    expect(names.has('unstable_changeRoute')).toBe(false);
  });

  test('client-core.ts does not import the history binding or router-state', () => {
    const src = readFileSync(join(routerSrc, 'client-core.ts'), 'utf8');
    const specs = [...src.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1]!,
    );
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec).not.toMatch(/client\.tsx|router-state/);
    }
  });

  test('follow primitives are the error-route module', () => {
    expect(clientCore.unstable_decideFollow).toBe(decideFollow);
    expect(clientCore.unstable_isFollowable).toBe(isFollowable);
    expect(clientCore.unstable_MAX_FOLLOWS_PER_NAVIGATION).toBe(
      MAX_FOLLOWS_PER_NAVIGATION,
    );
  });
});

describe('waku/router/client surface', () => {
  test('runtime export names stay the app-facing set', () => {
    expect(runtimeExportNames(client)).toEqual([
      'ErrorBoundary',
      'INTERNAL_ServerRouter',
      'Link',
      'Router',
      'SearchCodecsProvider_UNSTABLE',
      'Slice',
      'Unstable_SearchCodecsProvider',
      'unstable_HAS404_ID',
      'unstable_IS_STATIC_ID',
      'unstable_ROUTE_ID',
      'unstable_RouterContext',
      'unstable_addBase',
      'unstable_buildRouteHref',
      'unstable_encodeRoutePath',
      'unstable_encodeSliceId',
      'unstable_getErrorInfo',
      'unstable_getRouteSlotId',
      'unstable_getSliceSlotId',
      'unstable_matchRouteParams',
      'unstable_parseRoute',
      'unstable_removeBase',
      'unstable_useResolveSearchCodec',
      'useNavigationStatus_UNSTABLE',
      'useParams_UNSTABLE',
      'useRouter',
      'useSearch_UNSTABLE',
      'useSetSearch_UNSTABLE',
    ]);
  });

  test('client-core aliases the same module instances as client', () => {
    expect(clientCore.Slice_UNSTABLE).toBe(client.Slice);
    expect(clientCore.ErrorBoundary_UNSTABLE).toBe(client.ErrorBoundary);
    expect(clientCore.useParams_UNSTABLE).toBe(client.useParams_UNSTABLE);
    expect(clientCore.SearchCodecsProvider_UNSTABLE).toBe(
      client.SearchCodecsProvider_UNSTABLE,
    );
    expect(client.Unstable_SearchCodecsProvider).toBe(
      client.SearchCodecsProvider_UNSTABLE,
    );
    expect(clientCore.unstable_parseRoute).toBe(client.unstable_parseRoute);
    expect(clientCore.unstable_HAS404_ID).toBe(client.unstable_HAS404_ID);
    expect(clientCore.unstable_encodeRoutePath).toBe(
      client.unstable_encodeRoutePath,
    );
  });
});

describe('client utility boundaries', () => {
  test('client-core-utils does not depend on client-utils', () => {
    const dir = join(routerSrc, 'client-core-utils');
    const clientUtilsDir = join(routerSrc, 'client-utils');
    const fileNames = readdirSync(dir, {
      encoding: 'utf8',
      recursive: true,
    }).filter((fileName) => /\.[cm]?[jt]sx?$/.test(fileName));
    expect(fileNames.length).toBeGreaterThan(0);
    for (const fileName of fileNames) {
      const src = readFileSync(join(dir, fileName), 'utf8');
      const specs = [
        ...src.matchAll(/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g),
      ].map((match) => match[1]!);
      expect(
        specs.some((spec) => {
          if (!spec.startsWith('.')) {
            return false;
          }
          const target = resolve(dirname(join(dir, fileName)), spec);
          const path = relative(clientUtilsDir, target);
          return !path.startsWith('..') && !isAbsolute(path);
        }),
        fileName,
      ).toBe(false);
    }
  });
});
