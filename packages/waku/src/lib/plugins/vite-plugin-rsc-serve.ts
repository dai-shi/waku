import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// HACK: Depending on a different plugin isn't ideal.
// Maybe we could put in vite config object?
import { SRC_ENTRIES } from './vite-plugin-rsc-managed.js';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';

const resolveFileName = (fname: string) => {
  for (const ext of EXTENSIONS) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

export function rscServePlugin(opts: {
  srcDir: string;
  distServeJs: string;
  distDir: string;
  distPublic: string;
  srcServeFile: string;
  serve:
    | 'vercel'
    | 'netlify'
    | 'cloudflare'
    | 'partykit'
    | 'deno'
    | 'aws-lambda';
}): Plugin {
  return {
    name: 'rsc-serve-plugin',
    config(viteConfig) {
      // FIXME This seems too hacky (The use of viteConfig.root, '.', path.resolve and resolveFileName)
      const entriesFile = resolveFileName(
        path.resolve(viteConfig.root || '.', opts.srcDir, SRC_ENTRIES + '.js'),
      );
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[opts.distServeJs.replace(/\.js$/, '')] = opts.srcServeFile;
      }
      viteConfig.define = {
        ...viteConfig.define,
        'import.meta.env.WAKU_ENTRIES_FILE': JSON.stringify(entriesFile),
        'import.meta.env.WAKU_CONFIG_DIST_DIR': JSON.stringify(opts.distDir),
        'import.meta.env.WAKU_CONFIG_PUBLIC_DIR': JSON.stringify(
          opts.distPublic,
        ),
      };
      if (opts.serve === 'cloudflare' || opts.serve === 'partykit') {
        viteConfig.build ||= {};
        viteConfig.build.rollupOptions ||= {};
        viteConfig.build.rollupOptions.external ||= [];
        if (Array.isArray(viteConfig.build.rollupOptions.external)) {
          viteConfig.build.rollupOptions.external.push('hono');
          if (opts.serve === 'cloudflare') {
            viteConfig.build.rollupOptions.external.push(
              'hono/cloudflare-workers',
              '__STATIC_CONTENT_MANIFEST',
            );
          }
        } else {
          throw new Error(
            'Unsupported: build.rollupOptions.external is not an array',
          );
        }
      }
    },
  };
}
