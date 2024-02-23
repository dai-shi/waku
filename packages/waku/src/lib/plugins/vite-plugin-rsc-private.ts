import type { Plugin } from 'vite';

import { joinPath } from '../utils/path.js';

export function rscPrivatePlugin({
  privateDir,
}: {
  privateDir: string;
}): Plugin {
  let privatePath: string;
  return {
    name: 'rsc-private-plugin',
    configResolved(config) {
      privatePath = joinPath(config.root, privateDir);
    },
    load(id) {
      if (id.startsWith(privatePath)) {
        throw new Error('Private file access is not allowed');
      }
    },
  };
}
