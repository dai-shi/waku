import { describe, expect, test, vi } from 'vitest';
import {
  fsRouterTypegenPlugin,
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/plugins/vite-plugin-fs-router-typegen.js';
import { LoggingFunction, RollupLog } from 'rollup';
import { fileURLToPath } from 'node:url';
import { build, FSWatcher, ViteDevServer } from 'vite';
import path from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const root = fileURLToPath(
  new URL('./fixtures', import.meta.url),
);

async function runTest(root: string, expectedEntriesGen: string, srcDir = 'plugin-fs-router-typegen') {
  const entriesPath = path.join(root, srcDir, 'entries.gen.tsx');
  if (existsSync(entriesPath)) {
    rmSync(entriesPath);
  }
  const plugin = fsRouterTypegenPlugin({
    srcDir,
  });
  expect(plugin.configureServer).toBeDefined();
  expect(typeof plugin.configureServer).toBe('function');
  expect(plugin.configResolved).toBeDefined();
  expect(typeof plugin.configResolved).toBe('function');
  if (typeof plugin.configureServer !== 'function' || typeof plugin.configResolved !== 'function') {
    return;
  }
  // @ts-expect-error - we're not passing the full Vite config
  await plugin.configResolved?.({ root });
  await plugin.configureServer?.({ watcher: { add: () => { }, on: () => {} } as unknown as FSWatcher } as ViteDevServer);
  const generated = readFileSync(entriesPath, 'utf-8');
  expect(generated).toEqual(expectedEntriesGen);
}

vi.mock('prettier', () => {
  return { format: (x: string) => x, resolveConfig: () => ({ }) }
})

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
      '/one-two-three.tsx': 'OneTwoThree',
      '/one/two/three.tsx': 'OneTwoThree_1',
      '/one_two_three.tsx': 'OneTwoThree_2',
      '/one__two_three.tsx': 'OneTwoThree_3',
    });
  });

  test('creates the expected imports the generated entries file', async () => {
    await runTest(root, `export * from './_layout';\n`);
  });
});
