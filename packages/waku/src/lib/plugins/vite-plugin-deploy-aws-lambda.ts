import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

import { unstable_getPlatformObject } from '../../server.js';
import { EXTENSIONS, SRC_ENTRIES } from '../constants.js';
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
    '../../builder/serve-aws-lambda.js',
  ),
);

export function deployAwsLambdaPlugin(opts: {
  srcDir: string;
  distDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  return {
    name: 'deploy-aws-lambda-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (unstable_phase !== 'buildServerBundle' || deploy !== 'aws-lambda') {
        return;
      }

      // FIXME This seems too hacky (The use of viteConfig.root, '.', path.resolve and resolveFileName)
      const entriesFile = normalizePath(
        resolveFileName(
          path.resolve(viteConfig.root || '.', opts.srcDir, SRC_ENTRIES),
        ),
      );
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[DIST_SERVE_JS.replace(/\.js$/, '')] = srcServeFile;
      }
      viteConfig.define = {
        ...viteConfig.define,
        'import.meta.env.WAKU_ENTRIES_FILE': JSON.stringify(entriesFile),
        'import.meta.env.WAKU_CONFIG_PUBLIC_DIR': JSON.stringify(DIST_PUBLIC),
      };
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
