import * as vite from 'vite';
import type { Config } from '../../config.js';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, loadDotEnv } from './loader.js';
import type { PreviewServer } from './preview.js';

loadDotEnv();

export async function runBuild() {
  // set NODE_ENV before vite.runnerImport: https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= 'production';
  const config = await loadConfig();
  const builder = await vite.createBuilder({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  globalThis.__WAKU_START_PREVIEW_SERVER__ = () =>
    startPreviewServerImpl(config);
  await builder.buildApp();
}

async function startPreviewServerImpl(
  config: Required<Config>,
): Promise<PreviewServer> {
  const server = await vite.preview({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  return {
    baseUrl: server.resolvedUrls!.local[0]!,
    middlewares: {
      use: (fn) => server.middlewares.use(fn),
    },
    close: () => server.close(),
  };
}
