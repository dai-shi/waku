import type { Plugin } from 'vite';

export function rscServePlugin(opts: {
  serveJs: string;
  distDir: string;
  publicDir: string;
  indexHtml: string;
  entriesFile: string;
  srcServeFile: string;
  ssr: boolean;
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
        'import.meta.env.WAKU_BUILD_SSR': JSON.stringify(opts.ssr ? 'yes' : ''),
        'import.meta.env.WAKU_ENTRIES_FILE': JSON.stringify(opts.entriesFile),
        'import.meta.env.WAKU_CONFIG_DIST_DIR': JSON.stringify(opts.distDir),
        'import.meta.env.WAKU_CONFIG_PUBLIC_DIR': JSON.stringify(
          opts.publicDir,
        ),
        'import.meta.env.WAKU_CONFIG_INDEX_HTML': JSON.stringify(
          opts.indexHtml,
        ),
      };
    },
  };
}
