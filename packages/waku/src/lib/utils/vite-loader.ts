import { createServer as createViteServer } from 'vite';
import { fileURLToFilePath } from '../utils/path.js';

export const loadServerFile = async (fileURL: string) => {
  const vite = await createViteServer({
    ssr: {
      external: ['waku'],
    },
  });
  const mod = await vite.ssrLoadModule(fileURLToFilePath(fileURL));
  return {
    config: mod.default,
    cleanup: vite.close,
  };
};
