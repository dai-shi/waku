import { defineConfig } from 'waku/config';
import type { Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  unstable_viteConfigs: {
    'build-server': () => ({
      plugins: [importMetaUrlServerPlugin()],
    }),
  },
});

// emit asset and rewrite `new URL("./xxx", import.meta.url)` syntax for build.
function importMetaUrlServerPlugin(): Plugin {
  // https://github.com/vitejs/vite/blob/0f56e1724162df76fffd5508148db118767ebe32/packages/vite/src/node/plugins/assetImportMetaUrl.ts#L51-L52
  const assetImportMetaUrlRE =
    /\bnew\s+URL\s*\(\s*('[^']+'|"[^"]+"|`[^`]+`)\s*,\s*import\.meta\.url\s*(?:,\s*)?\)/dg;

  return {
    name: 'test-server-asset',
    transform(code, id) {
      return code.replace(assetImportMetaUrlRE, (s, match) => {
        const absPath = path.resolve(path.dirname(id), match.slice(1, -1));
        if (fs.existsSync(absPath)) {
          const referenceId = this.emitFile({
            type: 'asset',
            name: path.basename(absPath),
            source: new Uint8Array(fs.readFileSync(absPath)),
          });
          return `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`;
        }
        return s;
      });
    },
  };
}
