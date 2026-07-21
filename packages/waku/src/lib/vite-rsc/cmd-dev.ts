import path from 'node:path';
import * as vite from 'vite';
import type { Config } from '../../config.js';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, loadDotEnv } from './loader.js';

loadDotEnv();

function createServerRestartHandler(strictPort: boolean) {
  let restartInFlight = false;

  return async (
    host: string | undefined,
    port: number,
    server: vite.ViteDevServer,
  ) => {
    if (restartInFlight) {
      console.log('Server restart already in progress, skipping...');
      return;
    }
    restartInFlight = true;
    try {
      console.log('Restarting server with fresh plugin configuration...');
      const previousUrls = server.resolvedUrls;
      await server.close();
      const freshConfig = await loadConfig();
      const newServer = await startDevServer(
        host,
        port,
        freshConfig,
        strictPort,
        true,
      );
      if (previousUrls) {
        server.resolvedUrls = newServer.resolvedUrls;
      }
    } finally {
      restartInFlight = false;
    }
  };
}

async function startDevServer(
  host: string | undefined,
  port: number,
  config: Required<Config>,
  strictPort: boolean,
  isRestart?: boolean,
) {
  if (isRestart) {
    loadDotEnv();
  }
  const server = await vite.createServer({
    configFile: false,
    plugins: [combinedPlugins(config)],
    server: host ? { host, port, strictPort } : { port, strictPort },
  });
  const handleServerRestart = createServerRestartHandler(strictPort);
  // Override Vite's restart to intercept automatic restarts (.env, tsconfig, etc.)
  server.restart = async () => {
    console.log('Vite server restart intercepted, reloading Waku plugins...');
    await handleServerRestart(host, port, server);
  };
  await server.listen();
  const url =
    server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
  console.log(`ready: Listening on ${url}`);
  const watcher = server.watcher;
  watcher.on('change', handleConfigChange);
  watcher.on('unlink', handleConfigChange);
  watcher.on('add', handleConfigChange);

  async function handleConfigChange(changedFile: string) {
    const dirname = path.dirname(changedFile);
    const filename = path.basename(changedFile);
    if (
      dirname === process.cwd() &&
      (filename === 'waku.config.ts' || filename === 'waku.config.js')
    ) {
      console.log(`Waku configuration file changed, restarting server...`);
      await handleServerRestart(host, port, server);
    }
  }

  return server;
}

export async function runDev(flags: { host?: string; port?: string }) {
  // set NODE_ENV before vite.runnerImport: https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= 'development';
  const config = await loadConfig();
  const host = flags.host;
  const configuredPort = flags.port ?? process.env.PORT;
  const port = parseInt(configuredPort ?? '3000', 10);
  await startDevServer(host, port, config, configuredPort !== undefined);
}
