import type { Plugin } from 'vite';

import { unstable_getBuildOptions } from '../../server.js';
import { SRC_ENTRIES } from '../constants.js';
import { DIST_PUBLIC } from '../builder/constants.js';

const SERVE_JS = 'serve-deno.js';

const getServeJsContent = (
  distDir: string,
  distPublic: string,
  srcEntriesFile: string,
  honoEnhancerFile: string | undefined,
) => `
import { Hono } from 'jsr:@hono/hono';
import { serveStatic } from 'jsr:@hono/hono/deno';
import { serverEngine } from 'waku/unstable_hono';

const distDir = '${distDir}';
const publicDir = '${distPublic}';
const loadEntries = () => import('${srcEntriesFile}');
const loadHonoEnhancer = async () => {
  ${
    honoEnhancerFile
      ? `return (await import('${honoEnhancerFile}')).default;`
      : `return (fn) => fn;`
  }
};
const env = Deno.env.toObject();

const createApp = (app) => {
  app.use(serveStatic({ root: distDir + '/' + publicDir }));
  app.use(serverEngine({ cmd: 'start', loadEntries, env, unstable_onError: new Set() }));
  app.notFound(async (c) => {
    const file = distDir + '/' + publicDir + '/404.html';
    try {
      const info = await Deno.stat(file);
      if (info.isFile) {
        c.header('Content-Type', 'text/html; charset=utf-8');
        return c.body(await Deno.readFile(file), 404);
      }
    } catch {}
    return c.text('404 Not Found', 404);
  });
  return app;
};

const honoEnhancer = await loadHonoEnhancer();
const app = honoEnhancer(createApp)(new Hono());

Deno.serve(app.fetch);
`;

export function deployDenoPlugin(opts: {
  srcDir: string;
  distDir: string;
  unstable_honoEnhancer: string | undefined;
}): Plugin {
  const buildOptions = unstable_getBuildOptions();
  let entriesFile: string;
  let honoEnhancerFile: string | undefined;
  return {
    name: 'deploy-deno-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = buildOptions;
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'deno') {
        return;
      }
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[SERVE_JS.replace(/\.js$/, '')] = `${opts.srcDir}/${SERVE_JS}`;
      }
    },
    configResolved(config) {
      entriesFile = `${config.root}/${opts.srcDir}/${SRC_ENTRIES}`;
      if (opts.unstable_honoEnhancer) {
        honoEnhancerFile = `${config.root}/${opts.unstable_honoEnhancer}`;
      }
      const { deploy, unstable_phase } = buildOptions;
      if (
        (unstable_phase !== 'buildServerBundle' &&
          unstable_phase !== 'buildSsrBundle') ||
        deploy !== 'deno'
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
      if (source.startsWith('jsr:@hono/hono')) {
        return { id: source, external: true };
      }
    },
    load(id) {
      if (id === `${opts.srcDir}/${SERVE_JS}`) {
        return getServeJsContent(
          opts.distDir,
          DIST_PUBLIC,
          entriesFile,
          honoEnhancerFile,
        );
      }
    },
  };
}
