import { describe, expect, it, vi } from 'vitest';

const writeFile = vi.fn(async (..._args: unknown[]) => {});
const rm = vi.fn(async (..._args: unknown[]) => {});

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  rm: (...args: unknown[]) => rm(...args),
}));

const { pruneBuildOutput } =
  await import('../src/lib/utils-build/prune-build.js');

type RscBundle = Parameters<typeof pruneBuildOutput>[0]['rscBundle'];

const ROOT = '/proj';
const SRC = 'src';
const DIST = 'dist';

const makeBundle = (
  items: Array<
    | {
        type: 'chunk';
        fileName: string;
        facadeModuleId?: string | null;
        isEntry?: boolean;
        isDynamicEntry?: boolean;
        name?: string;
        imports?: string[];
        dynamicImports?: string[];
        importedAssets?: string[];
        importedCss?: string[];
      }
    | { type: 'asset'; fileName: string }
  >,
): RscBundle => {
  const out: RscBundle = {};
  for (const item of items) {
    if (item.type === 'chunk') {
      out[item.fileName] = {
        type: 'chunk',
        fileName: item.fileName,
        facadeModuleId: item.facadeModuleId ?? null,
        isEntry: item.isEntry ?? false,
        isDynamicEntry: item.isDynamicEntry ?? false,
        name: item.name ?? item.fileName.replace(/\..*$/, ''),
        imports: item.imports ?? [],
        dynamicImports: item.dynamicImports ?? [],
        ...(item.importedAssets || item.importedCss
          ? {
              viteMetadata: {
                importedAssets: new Set(item.importedAssets ?? []),
                importedCss: new Set(item.importedCss ?? []),
              },
            }
          : {}),
      };
    } else {
      out[item.fileName] = { type: 'asset', fileName: item.fileName };
    }
  }
  return out;
};

describe('pruneBuildOutput', () => {
  it('deletes assets referenced only by pruned chunks', async () => {
    writeFile.mockClear();
    rm.mockClear();
    const bundle = makeBundle([
      { type: 'chunk', fileName: 'build.js', isEntry: true, name: 'build' },
      // Static page chunk + its CSS asset.
      {
        type: 'chunk',
        fileName: 'static-page.js',
        facadeModuleId: '/proj/src/pages/static.tsx',
        isDynamicEntry: true,
        importedCss: ['static-page.css'],
      },
      { type: 'asset', fileName: 'static-page.css' },
    ]);

    const { stubbedChunks, deletedAssets } = await pruneBuildOutput({
      rootDir: ROOT,
      srcDir: SRC,
      distDir: DIST,
      rscBundle: bundle,
      prunableFiles: ['pages/static.tsx'],
    });

    expect(stubbedChunks).toContain('static-page.js');
    expect(deletedAssets).toContain('static-page.css');
    expect(rm).toHaveBeenCalledWith(`${ROOT}/${DIST}/server/static-page.css`, {
      force: true,
    });
  });

  it('keeps assets that are also referenced by a kept chunk', async () => {
    writeFile.mockClear();
    rm.mockClear();
    const bundle = makeBundle([
      { type: 'chunk', fileName: 'build.js', isEntry: true, name: 'build' },
      {
        type: 'chunk',
        fileName: 'static-page.js',
        facadeModuleId: '/proj/src/pages/static.tsx',
        isDynamicEntry: true,
        importedCss: ['shared.css'],
      },
      {
        type: 'chunk',
        fileName: 'dynamic-page.js',
        facadeModuleId: '/proj/src/pages/dynamic.tsx',
        isDynamicEntry: true,
        importedCss: ['shared.css'],
      },
      { type: 'asset', fileName: 'shared.css' },
    ]);

    const { stubbedChunks, deletedAssets } = await pruneBuildOutput({
      rootDir: ROOT,
      srcDir: SRC,
      distDir: DIST,
      rscBundle: bundle,
      prunableFiles: ['pages/static.tsx'],
    });

    expect(stubbedChunks).toContain('static-page.js');
    expect(deletedAssets).not.toContain('shared.css');
  });
});
