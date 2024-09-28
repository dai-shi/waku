import path from 'node:path';
import { writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getPlatformObject } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-aws-lambda.js';

const lambdaStreaming = process.env.DEPLOY_AWS_LAMBDA_STREAMING === 'true';

const getServeJsContent = (
  distDir: string,
  distPublic: string,
  srcEntriesFile: string,
) => `
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { runner, importHono, importHonoNodeServerServeStatic, importHonoAwsLambda } from 'waku/unstable_hono';

const { Hono } = await importHono();
const { serveStatic } = await importHonoNodeServerServeStatic();
const { ${lambdaStreaming ? 'streamHandle:' : ''}handle } = await importHonoAwsLambda();
let contextStorage;
try {
 ({ contextStorage } = await import('hono/context-storage'));
} catch {}

const distDir = '${distDir}';
const publicDir = '${distPublic}';
const loadEntries = () => import('${srcEntriesFile}');

const app = new Hono();
if (contextStorage) {
  app.use(contextStorage());
}
app.use('*', serveStatic({ root: distDir + '/' + publicDir }));
app.use('*', runner({ cmd: 'start', loadEntries, env: process.env }));
app.notFound(async (c) => {
  const file = path.join(distDir, publicDir, '404.html');
  if (existsSync(file)) {
    return c.html(readFileSync(file, 'utf8'), 404);
  }
  return c.text('404 Not Found', 404);
});

export const handler = handle(app);
`;

export function deployAwsLambdaPlugin(opts: {
  srcDir: string;
  distDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let entriesFile: string;
  return {
    name: 'deploy-aws-lambda-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'aws-lambda') {
        return;
      }
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[SERVE_JS.replace(/\.js$/, '')] = `${opts.srcDir}/${SERVE_JS}`;
      }
    },
    configResolved(config) {
      entriesFile = `${config.root}/${opts.srcDir}/${SRC_ENTRIES}`;
      const { deploy } = platformObject.buildOptions || {};
      if (deploy === 'aws-lambda' && Array.isArray(config.ssr.external)) {
        config.ssr.external = config.ssr.external.filter(
          (item) => item !== 'hono/context-storage',
        );
      }
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
    closeBundle() {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildDeploy' || deploy !== 'aws-lambda') {
        return;
      }

      writeFileSync(
        path.join(opts.distDir, 'package.json'),
        JSON.stringify({ type: 'module' }, null, 2),
      );
    },
  };
}
