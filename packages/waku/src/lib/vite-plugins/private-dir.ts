import type { Plugin } from 'vite';
import { joinPath } from '../utils/path.js';

export function privateDirPlugin({
  privateDir,
}: {
  privateDir: string;
}): Plugin {
  let privatePath: string;
  return {
    name: 'waku:vite-plugins:private-dir',
    enforce: 'pre',
    configResolved(viteConfig) {
      privatePath = joinPath(viteConfig.root, privateDir) + '/';
    },
    load(id) {
      if (this.environment.name === 'rsc') {
        return;
      }
      if (id.startsWith(privatePath)) {
        throw new Error('Load private directory in client side is not allowed');
      }
    },
    hotUpdate(ctx) {
      if (this.environment.name === 'rsc' && ctx.file.startsWith(privatePath)) {
        ctx.server.environments.client.hot.send({
          type: 'custom',
          event: 'rsc:update',
          data: {
            type: 'waku:private',
            file: ctx.file,
          },
        });
      }
    },
  };
}
