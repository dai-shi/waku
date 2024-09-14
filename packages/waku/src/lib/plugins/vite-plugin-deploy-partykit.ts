import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
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
    '../../builder/serve-partykit.js',
  ),
);

export function deployPartykitPlugin(opts: {
  srcDir: string;
  distDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  return {
    name: 'deploy-partykit-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'partykit') {
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
              main: `${opts.distDir}/${DIST_SERVE_JS}`,
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
