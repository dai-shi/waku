import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

import { unstable_getBuildOptions } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-partykit.js';

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
  async onFetch(request, lobby, ctx) {
    if (!serve) {
      serve = serverEngine({ cmd: 'start', loadEntries, env: lobby, unstable_onError: new Set() });
    }
    if (!app) {
      const honoEnhancer = await loadHonoEnhancer();
      app = honoEnhancer(createApp)(new Hono());
    }
    return app.fetch(request, lobby, ctx);
  },
};
`;

export function deployPartykitPlugin(opts: {
  srcDir: string;
  distDir: string;
  unstable_honoEnhancer: string | undefined;
}): Plugin {
  const buildOptions = unstable_getBuildOptions();
  let rootDir: string;
  let entriesFile: string;
  let honoEnhancerFile: string | undefined;
  return {
    name: 'deploy-partykit-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = buildOptions;
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
      if (opts.unstable_honoEnhancer) {
        honoEnhancerFile = `${rootDir}/${opts.unstable_honoEnhancer}`;
      }
      const { deploy, unstable_phase } = buildOptions;
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
        return getServeJsContent(entriesFile, honoEnhancerFile);
      }
    },
    closeBundle() {
      const { deploy, unstable_phase } = buildOptions;
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
