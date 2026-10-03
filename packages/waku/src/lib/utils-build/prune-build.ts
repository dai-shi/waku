import { rm, writeFile } from 'node:fs/promises';
import { DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils-isomorphic/path.js';

type Chunk = {
  type: 'chunk';
  fileName: string;
  imports: string[];
  dynamicImports: string[];
  facadeModuleId: string | null;
  isDynamicEntry: boolean;
  isEntry: boolean;
  name: string;
  viteMetadata?: {
    importedAssets?: Set<string>;
    importedCss?: Set<string>;
  };
};
type Asset = {
  type: 'asset';
  fileName: string;
};

// Removes server-bundle files unreachable except via `prunableFiles`:
// - chunks: stubbed (so dynamic imports still resolve)
// - emitted assets (CSS, fonts, wasm, ...): deleted
// Reachability roots are bundle entries plus non-pruned dynamic-entry chunks.
export const pruneBuildOutput = async ({
  rootDir,
  srcDir,
  distDir,
  rscBundle,
  prunableFiles,
}: {
  rootDir: string;
  srcDir: string;
  distDir: string;
  rscBundle: Record<string, Chunk | Asset>;
  prunableFiles: string[];
}): Promise<{ stubbedChunks: string[]; deletedAssets: string[] }> => {
  if (prunableFiles.length === 0) {
    return { stubbedChunks: [], deletedAssets: [] };
  }
  const prunableModuleIds = new Set(
    prunableFiles.map((p) => joinPath(rootDir, srcDir, p)),
  );

  const chunks: Chunk[] = [];
  const assets: Asset[] = [];
  for (const item of Object.values(rscBundle)) {
    if (item.type === 'chunk') {
      chunks.push(item);
    } else {
      assets.push(item);
    }
  }
  const chunkMap = new Map(chunks.map((c) => [c.fileName, c]));

  const viteAssetsOf = (chunk: Chunk) => [
    ...(chunk.viteMetadata?.importedAssets ?? []),
    ...(chunk.viteMetadata?.importedCss ?? []),
  ];

  // Standalone assets (e.g. `wrangler.json` from @cloudflare/vite-plugin)
  // aren't ours to manage.
  const chunkImportedAssets = new Set<string>();
  for (const chunk of chunks) {
    for (const a of viteAssetsOf(chunk)) {
      chunkImportedAssets.add(a);
    }
  }

  const allDynamicEntryFiles = new Set<string>();
  const keepRoots: string[] = [];
  for (const chunk of chunks) {
    if (chunk.isDynamicEntry) {
      allDynamicEntryFiles.add(chunk.fileName);
      const isPrunable =
        chunk.facadeModuleId && prunableModuleIds.has(chunk.facadeModuleId);
      if (!isPrunable) {
        keepRoots.push(chunk.fileName);
      }
    }
    // The 'build' entry is the SSG runner, not part of the runtime bundle.
    if (chunk.isEntry && chunk.name !== 'build') {
      keepRoots.push(chunk.fileName);
    }
  }

  // Each page subtree is evaluated independently - don't follow dynamic
  // imports across other dynamic-entry chunks.
  const keepFiles = new Set<string>();
  const visit = (fileName: string) => {
    if (keepFiles.has(fileName)) {
      return;
    }
    keepFiles.add(fileName);
    const chunk = chunkMap.get(fileName);
    if (!chunk) {
      return;
    }
    for (const imp of chunk.imports) {
      visit(imp);
    }
    for (const dyn of chunk.dynamicImports) {
      if (!allDynamicEntryFiles.has(dyn)) {
        visit(dyn);
      }
    }
    for (const a of viteAssetsOf(chunk)) {
      keepFiles.add(a);
    }
  };
  keepRoots.forEach(visit);

  const serverDir = joinPath(rootDir, distDir, DIST_SERVER);
  const stubbedChunks = chunks
    .map((c) => c.fileName)
    .filter((f) => !keepFiles.has(f));
  const deletedAssets = assets
    .map((a) => a.fileName)
    .filter((f) => chunkImportedAssets.has(f) && !keepFiles.has(f));

  await Promise.all([
    ...stubbedChunks.map((f) =>
      writeFile(
        joinPath(serverDir, f),
        '// Pruned by Waku - content cached at build time.\n',
      ),
    ),
    ...deletedAssets.map((f) => rm(joinPath(serverDir, f), { force: true })),
  ]);

  return { stubbedChunks, deletedAssets };
};
