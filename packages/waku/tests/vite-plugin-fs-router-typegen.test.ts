import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { resolveConfig } from '../src/lib/utils/config.js';
import { combinedPlugins } from '../src/lib/vite-plugins/combined-plugins.js';
import {
  detectFsRouterUsage,
  generateFsRouterTypes,
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/vite-plugins/fs-router-typegen.js';

// Run every typegen test under a reversed readdir order to simulate a different
// platform's filesystem; the generated output must stay deterministic (sorted),
// so pages.gen.ts does not churn across operating systems.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: (async (...args: Parameters<typeof actual.readdir>) => {
      const entries = await (
        actual.readdir as (...a: unknown[]) => Promise<unknown>
      )(...args);
      return Array.isArray(entries) ? entries.reverse() : entries;
    }) as typeof actual.readdir,
  };
});

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('vite-plugin-fs-router-typegen', () => {
  test('generates valid module names for fs entries', async () => {
    expect(toIdentifier('/_layout.tsx')).toBe('File_Layout');
    expect(toIdentifier('/_root.tsx')).toBe('File_Root');
    expect(toIdentifier('/[category]/[...tags]/index.tsx')).toBe(
      'File_CategoryTagsIndex',
    );
  });

  test('normalizes identifiers with punctuation and leading numbers', async () => {
    expect(toIdentifier('foo.bar.baz.tsx')).toBe('File_FooBarBaz');
    expect(toIdentifier('123abc.tsx')).toBe('File_123abc');
    expect(toIdentifier('__double__underscore__.tsx')).toBe(
      'File_DoubleUnderscore',
    );
  });

  test('allows unicode characters in module names', async () => {
    expect(toIdentifier('/øné_two_three.tsx')).toBe('File_ØnéTwoThree');
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
      'one-two-three.tsx': 'File_OneTwoThree',
      'one/two/three.tsx': 'File_OneTwoThree_1',
      'one_two_three.tsx': 'File_OneTwoThree_2',
      'one__two_three.tsx': 'File_OneTwoThree_3',
    });
  });

  test('strips leading slashes when computing import module names', async () => {
    expect(
      getImportModuleNames(['/foo.tsx', '/foo.jsx', 'bar/baz.tsx']),
    ).toEqual({
      'foo.tsx': 'File_Foo',
      'foo.jsx': 'File_Foo_1',
      'bar/baz.tsx': 'File_BarBaz',
    });
  });

  test('creates the expected imports the generated entries file', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen', 'pages'),
    );
    expect(generated).toContain(
      `// prettier-ignore
import type { getConfig as File_CategoryTagsIndex_getConfig } from './pages/[category]/[...tags]/index';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_OneTwoThree_getConfig } from './pages/one-two-three';
// prettier-ignore
import type { getConfig as File_OneTwoThree_1_getConfig } from './pages/one__two_three';
// prettier-ignore
import type { getConfig as File_OneTwoThree_2_getConfig } from './pages/one_two_three';
// prettier-ignore
import type { getConfig as File_ØnéTwoThree_getConfig } from './pages/øné_two_three';`,
    );
    // search codecs are derived from getConfig and augmented automatically
    expect(generated).toContain('SearchCodecsForPages');
    expect(generated).toContain(
      'interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}',
    );
    // layout paths (including dynamic ones) are emitted into a Layout union
    expect(generated).toContain('type Layout =');
    expect(generated).toContain("| { path: '/' }");
    expect(generated).toContain("| { path: '/[category]' }");
    expect(generated).toContain('layouts: Layout;');
  });

  test('generates types when waku.server uses fsRouter (managed mode)', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter'),
      ),
    ).toBe(true);
  });

  test('generates types when no waku.server is present (managed fallback)', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen'),
      ),
    ).toBe(true);
  });

  test('detects fsRouter even when imported with an alias', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter-alias'),
      ),
    ).toBe(true);
  });

  test('does not detect fsRouter when imported from non-waku sources', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter-fake'),
      ),
    ).toBe(false);
  });

  test('skips type generation when waku.server does not use fsRouter', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-createpages'),
      ),
    ).toMatchInlineSnapshot(`false`);
  });

  test('skips built-in Waku plugin when user plugin overrides it', async () => {
    const pluginName = 'waku:vite-plugins:build-id';
    const plugins = combinedPlugins(
      resolveConfig({
        vite: {
          plugins: [{ name: pluginName }],
        },
      }),
    );
    const flatPlugins = [plugins].flat(2);
    expect(
      flatPlugins.filter(
        (plugin) =>
          plugin &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          plugin.name === pluginName,
      ),
    ).toHaveLength(1);
  });

  test('returns undefined when there are no page files to scan', async () => {
    expect(
      await generateFsRouterTypes(
        path.join(fixturesDir, 'plugin-fs-router-typegen-empty', 'pages'),
      ),
    ).toBeUndefined();
  });

  test('skips getConfig imports for pages without getConfig', async () => {
    const generated = await generateFsRouterTypes(
      path.join(
        fixturesDir,
        'plugin-fs-router-typegen-missing-getconfig',
        'pages',
      ),
    );

    expect(generated).not.toContain('GetConfigResponse');
    expect(generated).not.toContain('_getConfig');
    expect(generated).not.toContain('SearchCodecsConfig');
    expect(generated).not.toContain('\n\n\n');
    expect(generated).toContain("| { path: '/'; render: 'static' }");
    expect(generated).toContain("| { path: '/about'; render: 'static' }");
  });

  test('emits page and layout paths while skipping ignored files and missing getConfig', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen-complex', 'pages'),
    );

    expect(generated).toBeTruthy();
    expect(generated).toContain(
      `import type { getConfig as File_GroupLandingIndex_getConfig } from './pages/(group)/landing/index';`,
    );
    expect(generated).toContain(
      `import type { getConfig as File_AdminDashboard_getConfig } from './pages/admin/dashboard';`,
    );
    expect(generated).toContain(
      `import type { getConfig as File_DocsIndex_getConfig } from './pages/docs/index';`,
    );
    // layout files are not imported and their filename is never leaked
    expect(generated).not.toContain('_layout');
    expect(generated).not.toContain('_components');
    expect(generated).toContain(
      "| ({ path: '/landing' } & GetConfigResponse<typeof File_GroupLandingIndex_getConfig>)",
    );
    expect(generated).toContain(
      "| ({ path: '/docs' } & GetConfigResponse<typeof File_DocsIndex_getConfig>)",
    );
    expect(generated).toContain(
      "| ({ path: '/admin/dashboard' } & GetConfigResponse<typeof File_AdminDashboard_getConfig>)",
    );
    expect(generated).toContain("| { path: '/blog/[slug]'; render: 'static' }");
    // the layout at docs/_layout.tsx is emitted as a layout path
    expect(generated).toContain('type Layout =');
    expect(generated).toContain("| { path: '/docs' }");
    expect(generated).toContain('layouts: Layout;');
    expect(generated).toContain("declare module 'waku/router'");
  });
});
