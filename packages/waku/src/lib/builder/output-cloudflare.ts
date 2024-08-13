import path from 'node:path';
import {
  existsSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import type { ResolvedConfig } from '../config.js';
import { DIST_PUBLIC } from './constants.js';

const WORKER_JS_NAME = '_worker.js';
const ROUTES_JSON_NAME = '_routes.json';

type StaticRoutes = { version: number; include: string[]; exclude: string[] };

export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  serveJs: string,
) => {
  const outDir = path.join(rootDir, config.distDir);

  // Advanced-mode Cloudflare Pages imports _worker.js
  // and can be configured with _routes.json to serve other static root files
  mkdirSync(path.join(outDir, WORKER_JS_NAME));
  const outPaths = readdirSync(outDir);
  for (const p of outPaths) {
    if (p === WORKER_JS_NAME) {
      continue;
    }
    renameSync(path.join(outDir, p), path.join(outDir, WORKER_JS_NAME, p));
  }

  const workerEntrypoint = path.join(outDir, WORKER_JS_NAME, 'index.js');
  if (!existsSync(workerEntrypoint)) {
    writeFileSync(
      workerEntrypoint,
      `
import server from './${serveJs}'

export default {
  ...server
}
`,
    );
  }

  // Create _routes.json if one doesn't already exist in the public dir
  // https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes
  const routesFile = path.join(outDir, ROUTES_JSON_NAME);
  const publicDir = path.join(outDir, WORKER_JS_NAME, DIST_PUBLIC);
  if (!existsSync(path.join(publicDir, ROUTES_JSON_NAME))) {
    const staticPaths: string[] = [];
    const paths = readdirSync(publicDir, {
      withFileTypes: true,
    });
    for (const p of paths) {
      if (p.isDirectory()) {
        const entry = `/${p.name}/*`;
        if (!staticPaths.includes(entry)) {
          staticPaths.push(entry);
        }
      } else {
        if (p.name === WORKER_JS_NAME) {
          return;
        }
        staticPaths.push(`/${p.name}`);
      }
    }
    const staticRoutes: StaticRoutes = {
      version: 1,
      include: ['/*'],
      exclude: staticPaths,
    };
    writeFileSync(routesFile, JSON.stringify(staticRoutes));
  }

  // Move the public files to the root of the dist folder
  const publicPaths = readdirSync(
    path.join(outDir, WORKER_JS_NAME, DIST_PUBLIC),
  );
  for (const p of publicPaths) {
    renameSync(
      path.join(outDir, WORKER_JS_NAME, DIST_PUBLIC, p),
      path.join(outDir, p),
    );
  }
  rmSync(path.join(outDir, WORKER_JS_NAME, DIST_PUBLIC), {
    recursive: true,
    force: true,
  });

  const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
  if (!existsSync(wranglerTomlFile)) {
    writeFileSync(
      wranglerTomlFile,
      `
# See https://developers.cloudflare.com/pages/functions/wrangler-configuration/
name = "waku-project"
compatibility_date = "2024-04-03"
compatibility_flags = [ "nodejs_als" ]
pages_build_output_dir = "./dist"
`,
    );
  }
};
