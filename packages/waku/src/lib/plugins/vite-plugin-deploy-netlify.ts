import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getBuildOptions } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-netlify.js';

const getServeJsContent = (
  srcEntriesFile: string,
  honoEnhancerFile: string | undefined,
) => `
import { serverEngine, importHono } from 'waku/unstable_hono';

const { Hono } = await importHono();

const loadEntries = () => import('${srcEntriesFile}');
const loadHonoEnhancer = async () => {
  ${
    honoEnhancerFile
      ? `return (await import('${honoEnhancerFile}')).default;`
      : `return (fn) => fn;`
  }
};

const createApp = (app) => {
  app.use(serverEngine({ cmd: 'start', loadEntries, env: process.env, unstable_onError: new Set() }));
  app.notFound((c) => {
    const notFoundHtml = globalThis.__WAKU_NOT_FOUND_HTML__;
    if (typeof notFoundHtml === 'string') {
      return c.html(notFoundHtml, 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

const honoEnhancer = await loadHonoEnhancer();
const app = honoEnhancer(createApp)(new Hono());

export default async (req, context) => app.fetch(req, { context });
`;

export function deployNetlifyPlugin(opts: {
  srcDir: string;
  distDir: string;
  privateDir: string;
  unstable_honoEnhancer: string | undefined;
}): Plugin {
  const buildOptions = unstable_getBuildOptions();
  let rootDir: string;
  let entriesFile: string;
  let honoEnhancerFile: string | undefined;
  return {
    name: 'deploy-netlify-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = buildOptions;
      if (
        unstable_phase !== 'buildServerBundle' ||
        (deploy !== 'netlify-functions' && deploy !== 'netlify-static')
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
      if (opts.unstable_honoEnhancer) {
        honoEnhancerFile = `${rootDir}/${opts.unstable_honoEnhancer}`;
      }
    },
    resolveId(source) {
      if (source === `${opts.srcDir}/${SERVE_JS}`) {
        return source;
      }
    },
    load(id) {
      if (id === `${opts.srcDir}/${SERVE_JS}`) {
        return getServeJsContent(entriesFile, honoEnhancerFile);
      }
    },
    closeBundle() {
      const { deploy, unstable_phase } = buildOptions;
      if (
        unstable_phase !== 'buildDeploy' ||
        (deploy !== 'netlify-functions' && deploy !== 'netlify-static')
      ) {
        return;
      }

      if (deploy === 'netlify-functions') {
        const functionsDir = path.join(rootDir, 'netlify-functions');
        mkdirSync(functionsDir, {
          recursive: true,
        });
        const notFoundFile = path.join(
          rootDir,
          opts.distDir,
          DIST_PUBLIC,
          '404.html',
        );
        const notFoundHtml = existsSync(notFoundFile)
          ? readFileSync(notFoundFile, 'utf8')
          : null;
        writeFileSync(
          path.join(functionsDir, 'serve.js'),
          `
globalThis.__WAKU_NOT_FOUND_HTML__ = ${JSON.stringify(notFoundHtml)};
export { default } from '../${opts.distDir}/${SERVE_JS}';
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
        );
      }
      const netlifyTomlFile = path.join(rootDir, 'netlify.toml');
      if (!existsSync(netlifyTomlFile)) {
        writeFileSync(
          netlifyTomlFile,
          `
[build]
  command = "npm run build -- --with-netlify"
  publish = "${opts.distDir}/${DIST_PUBLIC}"
[functions]
  included_files = ["${opts.privateDir}/**"]
  directory = "netlify-functions"
`,
        );
      }
    },
  };
}
