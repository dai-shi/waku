import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import type { Plugin, Rollup } from 'vite';
import { joinPath } from '../utils/path.js';
import { createProgressLogger } from '../utils/progress-logger.js';
import { pruneBuildOutput } from '../utils/prune-build.js';

export function staticBuildPlugin({
  srcDir,
  distDir,
}: {
  srcDir: string;
  distDir: string;
}): Plugin {
  let rscBundle: Rollup.OutputBundle | undefined;
  return {
    name: 'waku:vite-plugins:static-build',
    generateBundle(_options, bundle) {
      if (
        this.environment.name === 'rsc' &&
        this.environment.mode === 'build'
      ) {
        rscBundle = bundle;
      }
    },
    buildApp: {
      async handler(builder) {
        const viteConfig = builder.config;
        const rootDir = viteConfig.root;
        const progress = createProgressLogger();
        const emitFile = async (filePath: string, body: ReadableStream) => {
          const destFile = joinPath(rootDir, distDir, filePath);
          const rel = path.relative(rootDir, destFile);
          if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new Error('Invalid filePath: ' + filePath);
          }
          progress.update(`generating a file ${pc.dim(filePath)}`);
          await mkdir(joinPath(destFile, '..'), { recursive: true });
          await pipeline(
            Readable.fromWeb(body as never),
            fs.createWriteStream(destFile),
          );
        };
        const entryPath = path.join(
          viteConfig.environments.rsc!.build.outDir,
          'build.js',
        );
        console.log(pc.blue('[ssg] processing static generation...'));
        const startTime = performance.now();
        const entry: typeof import('../vite-entries/entry.build.js') =
          await import(pathToFileURL(entryPath).href);
        const { prunableFiles } = await entry.INTERNAL_runBuild({
          rootDir,
          emitFile,
        });
        if (prunableFiles.length && rscBundle) {
          const { stubbedChunks, deletedAssets } = await pruneBuildOutput({
            rootDir,
            srcDir,
            distDir,
            rscBundle,
            prunableFiles,
          });
          console.log(
            pc.blue(
              `[prune] removed static-only ${stubbedChunks.length} chunk(s) and ${deletedAssets.length} asset(s) from server bundle`,
            ),
          );
        }
        progress.done();
        const fileCount = progress.getCount();
        console.log(
          pc.green(
            `✓ ${fileCount} file${fileCount !== 1 ? 's' : ''} generated in ${Math.ceil(performance.now() - startTime)}ms`,
          ),
        );
      },
    },
  };
}
