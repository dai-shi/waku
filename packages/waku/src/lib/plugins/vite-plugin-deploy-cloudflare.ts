import path from 'node:path';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getPlatformObject } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_ENTRIES_JS, DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-cloudflare.js';

const getServeJsContent = (srcEntriesFile: string) => `
import { runner, importHono } from 'waku/unstable_hono';

const { Hono } = await importHono();

const loadEntries = () => import('${srcEntriesFile}');
let serveWaku;

const app = new Hono();
app.use((c, next) => serveWaku(c, next));
app.notFound(async (c) => {
  const assetsFetcher = c.env.ASSETS;
  const url = new URL(c.req.raw.url);
  const errorHtmlUrl = url.origin + '/404.html';
  const notFoundStaticAssetResponse = await assetsFetcher.fetch(
    new URL(errorHtmlUrl),
  );
  if (notFoundStaticAssetResponse && notFoundStaticAssetResponse.status < 400) {
    return c.body(notFoundStaticAssetResponse.body, 404);
  }
  return c.text('404 Not Found', 404);
});

export default {
  async fetch(request, env, ctx) {
    if (!serveWaku) {
      serveWaku = runner({ cmd: 'start', loadEntries, env });
    }
    return app.fetch(request, env, ctx);
  },
};
`;

const getFiles = (dir: string, files: string[] = []): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const WORKER_JS_NAME = '_worker.js';
const ROUTES_JSON_NAME = '_routes.json';
const HEADERS_NAME = '_headers';

type StaticRoutes = { version: number; include: string[]; exclude: string[] };

export function deployCloudflarePlugin(opts: {
  srcDir: string;
  distDir: string;
  rscPath: string;
  privateDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  let entriesFile: string;
  return {
    name: 'deploy-cloudflare-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'cloudflare') {
        return;
      }
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[SERVE_JS.replace(/\.js$/, '')] = `${opts.srcDir}/${SERVE_JS}`;
      }
    },
    configResolved(config) {
      rootDir = config.root;
      entriesFile = `${rootDir}/${opts.srcDir}/${SRC_ENTRIES}`;
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (
        (unstable_phase !== 'buildServerBundle' &&
          unstable_phase !== 'buildSsrBundle') ||
        deploy !== 'cloudflare'
      ) {
        return;
      }
      config.ssr.target = 'webworker';
      config.ssr.resolve ||= {};
      config.ssr.resolve.conditions ||= [];
      config.ssr.resolve.conditions.push('worker');
      config.ssr.resolve.externalConditions ||= [];
      config.ssr.resolve.externalConditions.push('worker');
    },
    resolveId(source) {
      if (source === `${opts.srcDir}/${SERVE_JS}`) {
        return source;
      }
    },
    load(id) {
      if (id === `${opts.srcDir}/${SERVE_JS}`) {
        return getServeJsContent(entriesFile);
      }
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
import server from './${SERVE_JS}'

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
        // exclude strategy
        const staticPaths: string[] = ['/assets/*'];
        const paths = getFiles(publicDir);
        for (const p of paths) {
          const basePath = path.dirname(p.replace(publicDir, '')) || '/';
          const name = path.basename(p);
          const entry =
            name === 'index.html'
              ? basePath + (basePath !== '/' ? '/' : '')
              : path.join(basePath, name.replace(/\.html$/, ''));
          if (
            entry.startsWith('/assets/') ||
            entry.startsWith('/' + WORKER_JS_NAME + '/') ||
            entry === '/' + WORKER_JS_NAME ||
            entry === '/' + ROUTES_JSON_NAME ||
            entry === '/' + HEADERS_NAME
          ) {
            continue;
          }
          if (!staticPaths.includes(entry)) {
            staticPaths.push(entry);
          }
        }
        const MAX_CLOUDFLARE_RULES = 100;
        if (staticPaths.length + 1 > MAX_CLOUDFLARE_RULES) {
          throw new Error(
            `The number of static paths exceeds the limit of ${MAX_CLOUDFLARE_RULES}. ` +
              `You need to create a custom ${ROUTES_JSON_NAME} file in the public folder. ` +
              `See https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes`,
          );
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

      appendFileSync(
        path.join(outDir, WORKER_JS_NAME, DIST_ENTRIES_JS),
        `export const buildData = ${JSON.stringify(platformObject.buildData)};`,
      );

      const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
      if (!existsSync(wranglerTomlFile)) {
        writeFileSync(
          wranglerTomlFile,
          `
# See https://developers.cloudflare.com/pages/functions/wrangler-configuration/
name = "waku-project"
compatibility_date = "2024-09-02"
compatibility_flags = [ "nodejs_als" ]
pages_build_output_dir = "./dist"
`,
        );
      }
    },
  };
}
