import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Plugin, normalizePath } from 'vite';
import { BUILD_METADATA_FILE, DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils-isomorphic/path.js';

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);

export function buildMetadataPlugin({ distDir }: { distDir: string }): Plugin {
  const virtualModule = 'virtual:vite-rsc-waku/build-metadata';
  const initialSource = 'export const buildMetadata = new Map();';
  return {
    name: 'waku:vite-plugins:build-metadata',
    resolveId(source, _importer, _options) {
      if (source === virtualModule) {
        assert.equal(this.environment.name, 'rsc');
        if (this.environment.mode === 'build') {
          return { id: source, external: true, moduleSideEffects: true };
        }
        return '\0' + virtualModule;
      }
    },
    load(id) {
      if (id === '\0' + virtualModule) {
        // no-op during dev
        assert.equal(this.environment.mode, 'dev');
        return initialSource;
      }
    },
    renderChunk(code, chunk) {
      if (code.includes(virtualModule)) {
        assert.equal(this.environment.name, 'rsc');
        const replacement = forceRelativePath(
          normalizePath(
            path.relative(path.join(chunk.fileName, '..'), BUILD_METADATA_FILE),
          ),
        );
        return code.replaceAll(virtualModule, () => replacement);
      }
    },
    buildApp: {
      async handler(builder) {
        const viteConfig = builder.config;
        const rootDir = viteConfig.root;
        const buildMetadataFile = joinPath(
          rootDir,
          distDir,
          DIST_SERVER,
          BUILD_METADATA_FILE,
        );
        await writeFile(buildMetadataFile, initialSource);
      },
    },
  };
}
