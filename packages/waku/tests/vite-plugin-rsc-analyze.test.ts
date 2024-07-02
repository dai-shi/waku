import { build } from 'vite';
import { expect, test, describe } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import type { LoggingFunction, RollupLog } from 'rollup';

import { rscAnalyzePlugin } from '../src/lib/plugins/vite-plugin-rsc-analyze.js';

const root = fileURLToPath(new URL('./fixtures', import.meta.url));

// FIXME vitest node environment does not have crypto
globalThis.crypto = crypto as any;

const onwarn = (warning: RollupLog, defaultHandler: LoggingFunction) => {
  if (
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    /"use (client|server)"/.test(warning.message)
  ) {
    return;
  } else if (
    warning.code === 'SOURCEMAP_ERROR' &&
    warning.loc?.column === 0 &&
    warning.loc?.line === 1
  ) {
    return;
  }
  defaultHandler(warning);
};

async function runTest(
  root: string,
  isClient: boolean,
  inputFile: string,
  expectedClientFileSet: Set<string>,
  expectedServerFileSet: Set<string>,
) {
  const clientFileSet = new Set<string>();
  const serverFileSet = new Set<string>();
  const fileHashMap = new Map<string, string>();
  await build({
    root: root,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: {
        onwarn,
        cache: false,
        input: path.resolve(root, inputFile),
      },
    },
    plugins: [
      isClient
        ? rscAnalyzePlugin({
            isClient: true,
            serverFileSet,
          })
        : rscAnalyzePlugin({
            isClient: false,
            clientFileSet,
            serverFileSet,
            fileHashMap,
          }),
    ],
  });
  // remove the base path
  [...clientFileSet].forEach((value) => {
    clientFileSet.delete(value);
    clientFileSet.add(path.relative(root, value));
  });
  [...serverFileSet].forEach((value) => {
    serverFileSet.delete(value);
    serverFileSet.add(path.relative(root, value));
  });

  expect(clientFileSet).toEqual(expectedClientFileSet);
  expect(serverFileSet).toEqual(expectedServerFileSet);
}

describe('vite-plugin-rsc-analyze', () => {
  test('server - server', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      false,
      'server.ts',
      new Set(),
      new Set(['server.ts']),
    );
  });

  test('client - server', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      true,
      'server.ts',
      new Set(),
      new Set(['server.ts']),
    );
  });

  test('server - client', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      false,
      'client.ts',
      new Set(['client.ts']),
      new Set(),
    );
  });

  test('client - client', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      true,
      'client.ts',
      new Set(),
      new Set(),
    );
  });

  test('server - import client', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      false,
      'import-client.ts',
      new Set(['client.ts']),
      new Set(),
    );
  });

  test('client - import client', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      true,
      'import-client.ts',
      new Set(),
      new Set(),
    );
  });

  test('server - import server', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      false,
      'import-server.ts',
      new Set(),
      new Set(['server.ts']),
    );
  });

  test('client - import server', async () => {
    await runTest(
      path.resolve(root, './plugin-rsc-analyze'),
      true,
      'import-server.ts',
      new Set(),
      new Set(['server.ts']),
    );
  });
});
