import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'waku/config';
import type { VitePlugin } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      {
        ...importMetaUrlServerPlugin(),
        apply: 'build',
        applyToEnvironment: (environment) => environment.name === 'rsc',
      },
    ],
  },
});

// emit asset and rewrite `new URL("./xxx", import.meta.url)` syntax for build.
function importMetaUrlServerPlugin(): VitePlugin {
  // https://github.com/vitejs/vite/blob/0f56e1724162df76fffd5508148db118767ebe32/packages/vite/src/node/plugins/assetImportMetaUrl.ts#L51-L52
  const assetImportMetaUrlRE =
    /\bnew\s+URL\s*\(\s*('[^']+'|"[^"]+"|`[^`]+`)\s*,\s*import\.meta\.url\s*(?:,\s*)?\)/dg;
  const referenceIds = new Set<string>();

  return {
    name: 'test-server-asset',
    // Vite's resolveFileUrl always returns, so this plugin must run first.
    enforce: 'pre',
    transform(code, id) {
      return code.replace(assetImportMetaUrlRE, (s, match) => {
        const absPath = path.resolve(path.dirname(id), match.slice(1, -1));
        if (fs.existsSync(absPath)) {
          const referenceId = this.emitFile({
            type: 'asset',
            name: path.basename(absPath),
            source: new Uint8Array(fs.readFileSync(absPath)),
          });
          referenceIds.add(referenceId);
          return `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`;
        }
        return s;
      });
    },
    resolveFileUrl(options: { referenceId: string; relativePath: string }) {
      if (!referenceIds.has(options.referenceId)) {
        return null;
      }
      return `new URL(${JSON.stringify(options.relativePath)}, import.meta.url).href`;
    },
  } as VitePlugin;
}
