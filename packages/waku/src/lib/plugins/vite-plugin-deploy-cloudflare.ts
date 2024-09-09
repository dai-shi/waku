import path from 'node:path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

// HACK: Depending on a different plugin isn't ideal.
// Maybe we could put in vite config object?
import { SRC_ENTRIES } from './vite-plugin-rsc-managed.js';

import { unstable_getPlatformObject } from '../../server.js';
import { EXTENSIONS } from '../config.js';
import {
  decodeFilePathFromAbsolute,
  extname,
  fileURLToFilePath,
  joinPath,
} from '../utils/path.js';
import { DIST_SERVE_JS, DIST_PUBLIC } from '../builder/constants.js';

const resolveFileName = (fname: string) => {
  for (const ext of EXTENSIONS) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

const srcServeFile = decodeFilePathFromAbsolute(
  joinPath(
    fileURLToFilePath(import.meta.url),
    '../../builder/serve-cloudflare.js',
  ),
);

const WORKER_JS_NAME = '_worker.js';
const ROUTES_JSON_NAME = '_routes.json';

type StaticRoutes = { version: number; include: string[]; exclude: string[] };

export function deployCloudflarePlugin(opts: {
  srcDir: string;
  distDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  return {
    name: 'deploy-cloudflare-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'cloudflare') {
        return;
      }

      // FIXME This seems too hacky (The use of viteConfig.root, '.', path.resolve and resolveFileName)
      const entriesFile = normalizePath(
        resolveFileName(
          path.resolve(
            viteConfig.root || '.',
            opts.srcDir,
            SRC_ENTRIES + '.jsx',
          ),
        ),
      );
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[DIST_SERVE_JS.replace(/\.js$/, '')] = srcServeFile;
      }
      viteConfig.define = {
        ...viteConfig.define,
        'import.meta.env.WAKU_ENTRIES_FILE': JSON.stringify(entriesFile),
      };
    },
    configResolved(config) {
      rootDir = config.root;
    },
    closeBundle() {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildDeploy' || deploy !== 'cloudflare') {
        return;
      }

      const outDir = path.join(rootDir, opts.distDir);

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
import server from './${DIST_SERVE_JS}'

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
    },
  };
}
