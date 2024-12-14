import path from 'node:path';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Plugin } from 'vite';

import { unstable_getPlatformObject } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_ENTRIES_JS, DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-cloudflare.js';

const getServeJsContent = (srcEntriesFile: string) => `
import { serverEngine, importHono } from 'waku/unstable_hono';

const { Hono } = await importHono();

const loadEntries = () => import('${srcEntriesFile}');
let serve;
let app;

const createApp = (app) => {
  app.use((c, next) => serve(c, next));
  app.notFound(async (c) => {
    const assetsFetcher = c.env.ASSETS;
    const url = new URL(c.req.raw.url);
    const errorHtmlUrl = url.origin + '/404.html';
    const notFoundStaticAssetResponse = await assetsFetcher.fetch(
      new URL(errorHtmlUrl),
    );
    if (
      notFoundStaticAssetResponse &&
      notFoundStaticAssetResponse.status < 400
    ) {
      return c.body(notFoundStaticAssetResponse.body, 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
};

export default {
  async fetch(request, env, ctx) {
    if (!serve) {
      serve = serverEngine({ cmd: 'start', loadEntries, env });
    }
    if (!app) {
      const entries = await loadEntries();
      const config = await entries.loadConfig();
      const honoEnhancer =
        config.unstable_honoEnhancer || ((createApp) => createApp);
      app = honoEnhancer(createApp)(new Hono());
    }
    return app.fetch(request, env, ctx);
  },
};
`;

function copyFiles(srcDir: string, destDir: string, extensions: string[]) {
  const files = readdirSync(srcDir, { withFileTypes: true });
  for (const file of files) {
    const srcPath = path.join(srcDir, file.name);
    const destPath = path.join(destDir, file.name);
    if (file.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyFiles(srcPath, destPath, extensions);
    } else if (extensions.some((ext) => file.name.endsWith(ext))) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyDirectory(srcDir: string, destDir: string) {
  const files = readdirSync(srcDir, { withFileTypes: true });
  for (const file of files) {
    const srcPath = path.join(srcDir, file.name);
    const destPath = path.join(destDir, file.name);
    if (file.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function separatePublicAssetsFromFunctions({
  outDir,
  functionDir,
  assetsDir,
}: {
  outDir: string;
  functionDir: string;
  assetsDir: string;
}) {
  const tempDist = path.join(
    os.tmpdir(),
    `dist_${randomBytes(16).toString('hex')}`,
  );
  const tempPublicDir = path.join(tempDist, DIST_PUBLIC);
  const workerPublicDir = path.join(functionDir, DIST_PUBLIC);

  // Create a temp dir to prepare the separated files
  rmSync(tempDist, { recursive: true, force: true });
  mkdirSync(tempDist, { recursive: true });

  // Move the current dist dir to the temp dir
  // Folders are copied instead of moved to avoid issues on Windows
  copyDirectory(outDir, tempDist);
  rmSync(outDir, { recursive: true, force: true });

  // Create empty directories at the desired deploy locations
  // for the function and the assets
  mkdirSync(functionDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  // Move tempDist/public to assetsDir
  copyDirectory(tempPublicDir, assetsDir);
  rmSync(tempPublicDir, { recursive: true, force: true });

  // Move tempDist to functionDir
  copyDirectory(tempDist, functionDir);
  rmSync(tempDist, { recursive: true, force: true });

  // Traverse assetsDir and copy specific files to functionDir/public
  mkdirSync(workerPublicDir, { recursive: true });
  copyFiles(assetsDir, workerPublicDir, [
    '.txt',
    '.html',
    '.json',
    '.js',
    '.css',
  ]);
}

export function deployCloudflarePlugin(opts: {
  srcDir: string;
  distDir: string;
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
      const assetsDistDir = path.join(outDir, 'assets');
      const workerDistDir = path.join(outDir, 'worker');

      // Move the public static assets to a separate folder from the server files
      separatePublicAssetsFromFunctions({
        outDir,
        assetsDir: assetsDistDir,
        functionDir: workerDistDir,
      });

      appendFileSync(
        path.join(workerDistDir, DIST_ENTRIES_JS),
        `export const buildData = ${JSON.stringify(platformObject.buildData)};`,
      );

      const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
      if (!existsSync(wranglerTomlFile)) {
        writeFileSync(
          wranglerTomlFile,
          `
# See https://developers.cloudflare.com/pages/functions/wrangler-configuration/
name = "waku-project"
compatibility_date = "2024-09-23"
compatibility_flags = [ "nodejs_als" ]
main = "./dist/worker/serve-cloudflare.js"

[assets]
directory = "./dist/assets"
binding = "ASSETS"
html_handling = "drop-trailing-slash"
# "single-page-application" | "404-page" | "none"
not_found_handling = "404-page"
`,
        );
      }
    },
  };
}
