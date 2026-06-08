import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, loadDotEnv } from './loader.js';

loadDotEnv();

export async function runStart(flags: { host?: string; port?: string }) {
  // set NODE_ENV before vite.runnerImport: https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= 'production';
  const config = await loadConfig();
  const host = flags.host;
  const port = await getFreePort(parseInt(flags.port || '8080', 10));
  const distDir = config?.distDir ?? 'dist';
  const serveFileUrl = pathToFileURL(
    path.resolve(distDir, 'serve-node.js'),
  ).href;
  if (host) {
    process.env.HOST = host;
  } else {
    delete process.env.HOST;
  }
  process.env.PORT = String(port);
  await import(serveFileUrl);
  // Defaulting '0.0.0.0' seems heuristic, and not useful.
  // Ref: https://github.com/wakujs/waku/pull/1987
  console.log(`ready: Listening on http://${host || '0.0.0.0'}:${port}/`);
}

async function getFreePort(startPort: number): Promise<number> {
  for (let port = startPort; ; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const srv = net
          .createServer()
          .once('error', reject)
          .once('listening', () => srv.close(() => resolve()))
          .listen(port);
      });
      return port;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw err;
      }
    }
  }
}
