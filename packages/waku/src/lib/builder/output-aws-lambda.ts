import path from 'node:path';
import { copyFileSync, rmSync, unlinkSync } from 'node:fs';
import { build as buildVite } from 'vite';
import type { ResolvedConfig } from '../config.js';

export const emitAwsLambdaOutput = async (config: ResolvedConfig) => {
  await buildVite({
    ssr: {
      noExternal: /^(?!node:)/,
    },
    build: {
      write: true,
      ssr: true,
      rollupOptions: {
        input: path.join(config.distDir, 'serve.js'),
        output: {
          dir: path.join(config.distDir, '.aws'),
          format: 'esm',
          inlineDynamicImports: true,
          compact: true,
        },
      },
    },
  });

  copyFileSync(
    path.join(config.distDir, '.aws', 'serve.js'),
    path.join(config.distDir, 'serve.mjs'),
  );
  rmSync(path.join(config.distDir, '.aws'), { recursive: true });
  rmSync(path.join(config.distDir, 'assets'), { recursive: true });
  unlinkSync(path.join(config.distDir, 'serve.js'));
  unlinkSync(path.join(config.distDir, 'entries.js'));
  unlinkSync(path.join(config.distDir, 'rsdw-server.js'));
};
