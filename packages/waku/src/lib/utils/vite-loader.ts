import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import { fileURLToFilePath } from '../utils/path.js';
import { mergeUserViteConfig } from './merge-vite-config.js';

const getViteServer = async () => {
  const mergedViteConfig = await mergeUserViteConfig({
    plugins: [
      viteReact(),
      { name: 'rsc-env-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'rsc-private-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'rsc-index-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'rsc-hmr-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'nonjs-resolve-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'rsc-transform-plugin' }, // dummy to match with dev-worker-impl.ts
      { name: 'rsc-delegate-plugin' }, // dummy to match with dev-worker-impl.ts
    ],
    ssr: {
      external: [
        'waku',
        'waku/client',
        'waku/server',
        'waku/router/client',
        'waku/router/server',
      ],
    },
    appType: 'custom',
  });
  const vite = await createViteServer(mergedViteConfig);
  return vite;
};

export const loadServerFile = async (fileURL: string) => {
  const vite = await getViteServer();
  try {
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
  } finally {
    await vite.close();
  }
};
