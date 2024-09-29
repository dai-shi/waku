import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getPlatformObject } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-partykit.js';

const getServeJsContent = (srcEntriesFile: string) => `
import { runner, importHono } from 'waku/unstable_hono';

const { Hono } = await importHono();

const loadEntries = () => import('${srcEntriesFile}');
let serveWaku;

const app = new Hono();
app.use((c, next) => serveWaku(c, next));
app.notFound(async (c) => {
  const assetsFetcher = c.env.assets;
  // check if there's a 404.html in the static assets
  const notFoundStaticAssetResponse = await assetsFetcher.fetch('/404.html');
  // if there is, return it
  if (notFoundStaticAssetResponse) {
    return new Response(notFoundStaticAssetResponse.body, {
      status: 404,
      statusText: 'Not Found',
      headers: notFoundStaticAssetResponse.headers,
    });
  }
  // otherwise, return a simple 404 response
  return c.text('404 Not Found', 404);
});

export default {
  onFetch(request, lobby, ctx) {
    if (!serveWaku) {
      serveWaku = runner({ cmd: 'start', loadEntries, env: lobby });
    }
    return app.fetch(request, lobby, ctx);
  },
};
`;

export function deployPartykitPlugin(opts: {
  srcDir: string;
  distDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  let entriesFile: string;
  return {
    name: 'deploy-partykit-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'partykit') {
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
        deploy !== 'partykit'
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
      if (unstable_phase !== 'buildDeploy' || deploy !== 'partykit') {
        return;
      }

      const partykitJsonFile = path.join(rootDir, 'partykit.json');
      if (!existsSync(partykitJsonFile)) {
        writeFileSync(
          partykitJsonFile,
          JSON.stringify(
            {
              name: 'waku-project',
              main: `${opts.distDir}/${SERVE_JS}`,
              compatibilityDate: '2023-02-16',
              serve: `./${opts.distDir}/${DIST_PUBLIC}`,
            },
            null,
            2,
          ) + '\n',
        );
      }
    },
  };
}
