import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    '../../builder/serve-netlify.js',
  ),
);

export function deployNetlifyPlugin(opts: {
  srcDir: string;
  distDir: string;
  privateDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  return {
    name: 'deploy-netlify-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (
        unstable_phase !== 'buildServerBundle' ||
        (deploy !== 'netlify-functions' && deploy !== 'netlify-static')
      ) {
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
    },
    closeBundle() {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (
        unstable_phase !== 'buildDeploy' ||
        (deploy !== 'netlify-functions' && deploy !== 'netlify-static')
      ) {
        return;
      }

      if (deploy === 'netlify-functions') {
        const functionsDir = path.join(rootDir, 'netlify/functions');
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
export { default } from '../../${opts.distDir}/${DIST_SERVE_JS}';
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
`,
        );
      }
    },
  };
}
