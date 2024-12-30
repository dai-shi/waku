import { createServer as createViteServer } from 'vite';
import type { RunnableDevEnvironment } from 'vite';

import { fileURLToFilePath } from '../utils/path.js';

export const loadServerFile = async (fileURL: string) => {
  const vite = await createViteServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    environments: {
      config: {
        resolve: { external: ['waku'] },
      },
    },
  });
  await vite.ws.close();
  await Promise.all(
    Object.values(vite.environments).map(
      (env) => env.name === 'config' || env.close(),
    ),
  );
  const mod = await (
    vite.environments.config as RunnableDevEnvironment
  ).runner.import(fileURLToFilePath(fileURL));
  return mod;
};
