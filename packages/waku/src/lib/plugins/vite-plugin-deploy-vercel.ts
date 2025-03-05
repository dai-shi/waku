import path from 'node:path';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getBuildOptions } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';
import { emitPlatformData } from '../builder/platform-data.js';

const SERVE_JS = 'serve-vercel.js';

const getServeJsContent = (
  distDir: string,
  distPublic: string,
  srcEntriesFile: string,
) => `
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { serverEngine, importHono, importHonoNodeServer } from 'waku/unstable_hono';

const { Hono } = await importHono();
const { getRequestListener } = await importHonoNodeServer();

const distDir = '${distDir}';
const publicDir = '${distPublic}';
const loadEntries = () => import('${srcEntriesFile}');
const configPromise = loadEntries().then((entries) => entries.loadConfig());

const createApp = (app) => {
  app.use(serverEngine({ cmd: 'start', loadEntries, env: process.env, unstable_onError: new Set() }));
  app.notFound((c) => {
    // FIXME better implementation using node stream?
    const file = path.join(distDir, publicDir, '404.html');
    if (existsSync(file)) {
      return c.html(readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

const honoEnhancer =
  (await configPromise).unstable_honoEnhancer || ((createApp) => createApp);
const app = honoEnhancer(createApp)(new Hono());

export default getRequestListener(app.fetch);
`;

export function deployVercelPlugin(opts: {
  srcDir: string;
  distDir: string;
  basePath: string;
  rscBase: string;
  privateDir: string;
}): Plugin {
  const buildOptions = unstable_getBuildOptions();
  let rootDir: string;
  let entriesFile: string;
  return {
    name: 'deploy-vercel-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = buildOptions;
      if (
        unstable_phase !== 'buildServerBundle' ||
        (deploy !== 'vercel-serverless' && deploy !== 'vercel-static')
      ) {
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
    },
    resolveId(source) {
      if (source === `${opts.srcDir}/${SERVE_JS}`) {
        return source;
      }
    },
    load(id) {
      if (id === `${opts.srcDir}/${SERVE_JS}`) {
        return getServeJsContent(opts.distDir, DIST_PUBLIC, entriesFile);
      }
    },
    async closeBundle() {
      const { deploy, unstable_phase } = buildOptions;
      if (
        unstable_phase !== 'buildDeploy' ||
        (deploy !== 'vercel-serverless' && deploy !== 'vercel-static')
      ) {
        return;
      }

      const publicDir = path.join(rootDir, opts.distDir, DIST_PUBLIC);
      const outputDir = path.resolve('.vercel', 'output');
      cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

      if (deploy === 'vercel-serverless') {
        // for serverless function
        const serverlessDir = path.join(
          outputDir,
          'functions',
          opts.rscBase + '.func',
        );
        mkdirSync(path.join(serverlessDir, opts.distDir), {
          recursive: true,
        });
        cpSync(
          path.join(rootDir, opts.distDir),
          path.join(serverlessDir, opts.distDir),
          { recursive: true },
        );
        await emitPlatformData(path.join(serverlessDir, opts.distDir));
        if (existsSync(path.join(rootDir, opts.privateDir))) {
          cpSync(
            path.join(rootDir, opts.privateDir),
            path.join(serverlessDir, opts.privateDir),
            { recursive: true, dereference: true },
          );
        }
        const vcConfigJson = {
          runtime: 'nodejs20.x',
          handler: `${opts.distDir}/${SERVE_JS}`,
          launcherType: 'Nodejs',
        };
        writeFileSync(
          path.join(serverlessDir, '.vc-config.json'),
          JSON.stringify(vcConfigJson, null, 2),
        );
        writeFileSync(
          path.join(serverlessDir, 'package.json'),
          JSON.stringify({ type: 'module' }, null, 2),
        );
      }

      const routes =
        deploy === 'vercel-serverless'
          ? [
              { handle: 'filesystem' },
              {
                src: opts.basePath + '(.*)',
                dest: opts.basePath + opts.rscBase + '/',
              },
            ]
          : undefined;
      const configJson = { version: 3, routes };
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        path.join(outputDir, 'config.json'),
        JSON.stringify(configJson, null, 2),
      );
    },
  };
}
