import { createServer as createViteServer } from 'vite';

import { fileURLToFilePath } from '../utils/path.js';

export const loadServerFile = async (fileURL: string) => {
  const vite = await createViteServer({
    ssr: {
      external: ['waku'],
    },
    server: { middlewareMode: true, watch: null },
  });
  try {
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
  } finally {
    await vite.ws.close();
  }
};
