import type { Plugin } from 'vite';

export function rscServePlugin(opts: {
  serveJs: string;
  distDir: string;
  publicDir: string;
  indexHtml: string;
  entriesFile: string;
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
      const { input } = viteConfig.build?.rollupOptions ?? {};
      if (input && !(typeof input === 'string') && !(input instanceof Array)) {
        input[opts.serveJs.replace(/\.js$/, '')] = opts.srcServeFile;
      }
      viteConfig.define = {
        ...viteConfig.define,
        'import.meta.env.WAKU_ENTRIES_FILE': JSON.stringify(opts.entriesFile),
        'import.meta.env.WAKU_CONFIG_DIST_DIR': JSON.stringify(opts.distDir),
        'import.meta.env.WAKU_CONFIG_PUBLIC_DIR': JSON.stringify(
          opts.publicDir,
        ),
        'import.meta.env.WAKU_CONFIG_INDEX_HTML': JSON.stringify(
          opts.indexHtml,
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
