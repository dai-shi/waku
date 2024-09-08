import path from 'node:path';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  joinPath(fileURLToFilePath(import.meta.url), '../../builder/serve-vercel.js'),
);

export function deployVercelPlugin(opts: {
  srcDir: string;
  distDir: string;
  basePath: string;
  rscPath: string;
  privateDir: string;
}): Plugin {
  const platformObject = unstable_getPlatformObject();
  let rootDir: string;
  return {
    name: 'deploy-vercel-plugin',
    config(viteConfig) {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
      if (
        unstable_phase !== 'buildServerBundle' ||
        (deploy !== 'vercel-serverless' && deploy !== 'vercel-static')
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
        'import.meta.env.WAKU_CONFIG_DIST_DIR': JSON.stringify(opts.distDir),
        'import.meta.env.WAKU_CONFIG_PUBLIC_DIR': JSON.stringify(DIST_PUBLIC),
      };
    },
    configResolved(config) {
      rootDir = config.root;
    },
    closeBundle() {
      const { deploy, unstable_phase } = platformObject.buildOptions || {};
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
          opts.rscPath + '.func',
        );
        mkdirSync(path.join(serverlessDir, opts.distDir), {
          recursive: true,
        });
        cpSync(
          path.join(rootDir, opts.distDir),
          path.join(serverlessDir, opts.distDir),
          { recursive: true },
        );
        if (existsSync(path.join(rootDir, opts.privateDir))) {
          cpSync(
            path.join(rootDir, opts.privateDir),
            path.join(serverlessDir, opts.privateDir),
            { recursive: true, dereference: true },
          );
        }
        const vcConfigJson = {
          runtime: 'nodejs20.x',
          handler: `${opts.distDir}/${DIST_SERVE_JS}`,
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
                dest: opts.basePath + opts.rscPath + '/',
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
