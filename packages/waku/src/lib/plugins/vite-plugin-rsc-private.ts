import type { Plugin } from 'vite';

import { joinPath } from '../utils/path.js';
import type { HotUpdatePayload } from './vite-plugin-rsc-hmr.js';

export function rscPrivatePlugin({
  privateDir,
  hotUpdateCallback,
}: {
  privateDir: string;
  hotUpdateCallback?: (payload: HotUpdatePayload) => void;
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
    handleHotUpdate({ file }) {
      if (file.startsWith(privatePath)) {
        hotUpdateCallback?.({ type: 'custom', event: 'rsc-reload' });
      }
    },
  };
}
