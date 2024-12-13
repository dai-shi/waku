import { createServer as createViteServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { fileURLToFilePath } from '../utils/path.js';

let vite: ViteDevServer | undefined;

export const loadServerFile = async (fileURL: string) => {
  if (!vite) {
    vite = await createViteServer({
      ssr: {
        external: ['waku'],
      },
    });
  }
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
};
