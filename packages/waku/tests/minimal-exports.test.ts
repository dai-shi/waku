// @vitest-environment happy-dom

import { createRequire } from 'node:module';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import type { Unstable_ServerEntry as ServerEntry } from '../src/adapter-builders.js';
import {
  base64ToBytes,
  bytesToBase64,
} from '../src/lib/utils-isomorphic/base64-web.js';
import { getGrouplessPath } from '../src/lib/utils-isomorphic/create-pages.js';
import { isIgnoredPath } from '../src/lib/utils-isomorphic/fs-router.js';
import { buildElements } from '../src/lib/utils-server/build-elements.js';
import * as clientRuntime from '../src/minimal/client-runtime.js';
import * as client from '../src/minimal/client.js';
import * as server from '../src/minimal/server.js';
import type {
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_Handlers as Handlers,
  Unstable_RenderHtml as RenderHtml,
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
  'useElementsPromise_UNSTABLE',
  'useFetchRsc_UNSTABLE',
  'useMergeElements_UNSTABLE',
  'useRegisterRscEnhancer_UNSTABLE',
  'useRegisterRscReloadListener_UNSTABLE',
];

const clientCompatibilityExports = [
  'INTERNAL_ServerRoot',
  'unstable_addBase',
  'unstable_callServerRsc',
  'unstable_removeBase',
];

const serverExports = [
  'unstable_buildElements',
  'unstable_createCustomError',
  'unstable_formatRscUrl',
  'unstable_getErrorInfo',
  'unstable_parseRequest',
];

const serverCompatibilityExports = [
  'unstable_base64ToBytes',
  'unstable_bytesToBase64',
  'unstable_defineHandlers',
  'unstable_defineServerEntry',
  'unstable_getGrouplessPath',
  'unstable_isIgnoredPath',
];

describe('Minimal entry points', () => {
  test('handler and adapter contracts are available without identity helpers', () => {
    expectTypeOf<Handlers>().toEqualTypeOf<
      Parameters<typeof server.unstable_defineHandlers>[0]
    >();
    expectTypeOf<HandleRequest>().toEqualTypeOf<Handlers['handleRequest']>();
    expectTypeOf<HandleBuild>().toEqualTypeOf<Handlers['handleBuild']>();
    expectTypeOf<RenderRsc>().toEqualTypeOf<
      Parameters<HandleRequest>[1]['renderRsc']
    >();
    expectTypeOf<RenderHtml>().toEqualTypeOf<
      Parameters<HandleRequest>[1]['renderHtml']
    >();
    expectTypeOf<ServerEntry>().toEqualTypeOf<
      Parameters<typeof server.unstable_defineServerEntry>[0]
    >();
  });

  test('client exposes the kernel and explicit compatibility aliases', () => {
    expect(Object.keys(client).sort()).toEqual(
      [...clientExports, ...clientCompatibilityExports].sort(),
    );
  });

  test('server exposes the kernel and explicit compatibility aliases', () => {
    expect(Object.keys(server).sort()).toEqual(
      [...serverExports, ...serverCompatibilityExports].sort(),
    );
  });

  test('compatibility imports share the framework implementation', () => {
    for (const name of clientCompatibilityExports) {
      expect(Reflect.get(client, name), name).toBe(
        Reflect.get(clientRuntime, name),
      );
    }
    expect(client.useMergeElements_UNSTABLE).toBe(
      clientRuntime.useMergeElements_UNSTABLE,
    );
    expect(client.useRegisterRscReloadListener_UNSTABLE).toBe(
      clientRuntime.useRegisterRscReloadListener_UNSTABLE,
    );
    expect(server.unstable_buildElements).toBe(buildElements);
    expect(server.unstable_base64ToBytes).toBe(base64ToBytes);
    expect(server.unstable_bytesToBase64).toBe(bytesToBase64);
    expect(server.unstable_getGrouplessPath).toBe(getGrouplessPath);
    expect(server.unstable_isIgnoredPath).toBe(isIgnoredPath);
    const handlers = {
      handleRequest: async () => null,
      handleBuild: async () => {},
    };
    expect(server.unstable_defineHandlers(handlers)).toBe(handlers);
    const entry = { fetch: () => new Response(), build: async () => {} };
    expect(server.unstable_defineServerEntry(entry)).toBe(entry);
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
