import { createServer as createViteServer } from 'vite';
import { fileURLToFilePath } from '../utils/path.js';

export const loadServerFile = async (fileURL: string) => {
  const vite = await createViteServer();
  try {
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
  } finally {
    await vite.close();
  }
};
