import path from 'node:path';
import type { Plugin } from 'vite';

export function rscPrivatePlugin({
  privateDir,
}: {
  privateDir: string;
}): Plugin {
  let privatePath: string;
  return {
    name: 'rsc-env-plugin',
    configResolved(config) {
      privatePath = path.join(config.root, privateDir);
    },
    resolveId(id) {
      if (id.startsWith(privatePath)) {
        throw new Error('Private file access is not allowed');
      }
    },
  };
}
