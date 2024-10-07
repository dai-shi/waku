import { describe, expect, test, vi } from 'vitest';
import {
  fsRouterTypegenPlugin,
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/plugins/vite-plugin-fs-router-typegen.js';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import { FSWatcher } from 'vite';
import { writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('./fixtures', import.meta.url));

vi.mock('prettier', () => {
  return { format: (x: string) => x, resolveConfig: () => ({}) };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    // https://vitest.dev/api/vi.html#vi-mock
    // @ts-expect-error - docs say this should be inferred...
    ...mod,
    writeFile: vi.fn(),
  };
});

async function runTest(
  root: string,
  expectedEntriesGen: string,
  srcDir = 'plugin-fs-router-typegen',
) {
  const plugin = fsRouterTypegenPlugin({
    srcDir,
  });
  expect(plugin.configureServer).toBeDefined();
  expect(typeof plugin.configureServer).toBe('function');
  expect(plugin.configResolved).toBeDefined();
  expect(typeof plugin.configResolved).toBe('function');
  if (
    typeof plugin.configureServer !== 'function' ||
    typeof plugin.configResolved !== 'function'
  ) {
    return;
  }
  // @ts-expect-error - we're not passing the full Vite config
  await plugin.configResolved?.({ root });
  await plugin.configureServer?.({
    watcher: { add: () => {}, on: () => {} } as unknown as FSWatcher,
  } as ViteDevServer);
  await vi.waitFor(async () => {
    if (vi.mocked(writeFile).mock.lastCall === undefined) {
      throw new Error('writeFile not called');
    }
  });
  expect(vi.mocked(writeFile).mock.lastCall?.[1]).toContain(expectedEntriesGen);
}

describe('vite-plugin-fs-router-typegen', () => {
  test('generates valid module names for fs entries', async () => {
    expect(toIdentifier('/_layout.tsx')).toBe('Layout');
    expect(toIdentifier('/[category]/[...tags]/index.tsx')).toBe(
      'CategoryTagsIndex',
    );
  });

  test('allows unicode characters in module names', async () => {
    expect(toIdentifier('/øné_two_three.tsx')).toBe('ØnéTwoThree');
  });

  test('handles collisions of fs entry module names', async () => {
    expect(
      getImportModuleNames([
        '/one-two-three.tsx',
        '/one/two/three.tsx',
        '/one_two_three.tsx',
        '/one__two_three.tsx',
      ]),
    ).toEqual({
      'one-two-three.tsx': 'OneTwoThree',
      'one/two/three.tsx': 'OneTwoThree_1',
      'one_two_three.tsx': 'OneTwoThree_2',
      'one__two_three.tsx': 'OneTwoThree_3',
    });
  });

  test('creates the expected imports the generated entries file', async () => {
    await runTest(
      root,
      `import CategoryTagsIndex, { getConfig as CategoryTagsIndex_getConfig } from './pages/[category]/[...tags]/index';
import CategoryLayout, { getConfig as CategoryLayout_getConfig } from './pages/[category]/_layout';
import Layout, { getConfig as Layout_getConfig } from './pages/_layout';
import Index, { getConfig as Index_getConfig } from './pages/index';
import OneTwoThree, { getConfig as OneTwoThree_getConfig } from './pages/one-two-three';
import OneTwoThree_1, { getConfig as OneTwoThree_1_getConfig } from './pages/one__two_three';
import OneTwoThree_2, { getConfig as OneTwoThree_2_getConfig } from './pages/one_two_three';
import ØnéTwoThree, { getConfig as ØnéTwoThree_getConfig } from './pages/øné_two_three';`,
    );
  });
});
