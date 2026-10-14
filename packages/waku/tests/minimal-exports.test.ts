// @vitest-environment happy-dom

import { createRequire } from 'node:module';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import type {
  Unstable_ServerEntry as ServerEntry,
  unstable_createServerEntryAdapter,
} from '../src/adapter-builders.js';
import { buildElements } from '../src/lib/utils-server/build-elements.js';
import * as clientRuntime from '../src/minimal/client-runtime.js';
import * as client from '../src/minimal/client.js';
import * as server from '../src/minimal/server.js';
import type {
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_Handlers as Handlers,
  Unstable_RenderHtml as RenderHtml,
  Unstable_RenderHtmlFallback as RenderHtmlFallback,
  Unstable_RenderRsc as RenderRsc,
} from '../src/minimal/server.js';

vi.mock('react-server-dom-webpack/client', () => ({ default: {} }));

const require = createRequire(import.meta.url);

const clientExports = [
  'Children_UNSTABLE',
  'Root_UNSTABLE',
  'Slot_UNSTABLE',
  'unstable_combineElements',
  'unstable_getErrorInfo',
  'unstable_isImmutableElement',
  'unstable_isSameElement',
  'useElementsPromise_UNSTABLE',
  'useFetchRsc_UNSTABLE',
  'useMergeElements_UNSTABLE',
  'useRegisterRscEnhancer_UNSTABLE',
  'useRegisterRscReloadListener_UNSTABLE',
];

const serverExports = [
  'unstable_buildElements',
  'unstable_createCustomError',
  'unstable_formatRscUrl',
  'unstable_getErrorInfo',
  'unstable_parseRequest',
];

describe('Minimal entry points', () => {
  test('handler and adapter contracts are available without identity helpers', () => {
    expectTypeOf<Handlers>().toEqualTypeOf<
      Parameters<ReturnType<typeof unstable_createServerEntryAdapter>>[0]
    >();
    expectTypeOf<HandleRequest>().toEqualTypeOf<Handlers['handleRequest']>();
    expectTypeOf<HandleBuild>().toEqualTypeOf<Handlers['handleBuild']>();
    expectTypeOf<RenderRsc>().toEqualTypeOf<
      Parameters<HandleRequest>[1]['renderRsc']
    >();
    expectTypeOf<RenderHtml>().toEqualTypeOf<
      Parameters<HandleRequest>[1]['renderHtml']
    >();
    expectTypeOf<RenderHtmlFallback>().toEqualTypeOf<
      Parameters<HandleRequest>[1]['renderHtmlFallback']
    >();
    expectTypeOf<ServerEntry>().toEqualTypeOf<
      ReturnType<ReturnType<typeof unstable_createServerEntryAdapter>>
    >();
  });

  test('client exposes only the client rendering API', () => {
    expect(Object.keys(client).sort()).toEqual(clientExports.sort());
  });

  test('server exposes only the server rendering API', () => {
    expect(Object.keys(server).sort()).toEqual(serverExports.sort());
  });

  test('public primitives share the framework implementation', () => {
    for (const name of clientExports) {
      expect(Reflect.get(client, name), name).toBe(
        Reflect.get(clientRuntime, name),
      );
    }
    expect(server.unstable_buildElements).toBe(buildElements);
  });

  test('custom errors expose the same protocol on the server and client', () => {
    const info = { status: 307, location: '/next', unstable_leave: true };
    const error = server.unstable_createCustomError('redirect', info);
    expect(server.unstable_getErrorInfo(error)).toEqual(info);
    expect(client.unstable_getErrorInfo(error)).toEqual(info);
    expect(
      client.unstable_getErrorInfo(new Error('ordinary error')),
    ).toBeNull();
  });

  test('the client runtime is not a package entry point', () => {
    expect(() => require.resolve('waku/minimal/client-runtime')).toThrow(
      expect.objectContaining({
        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      }),
    );
  });
});
