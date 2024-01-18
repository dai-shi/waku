import type { Plugin } from 'vite';

export function rscServePlugin(opts: {
  serveJs: string;
  entriesJs: string;
  publicDir: string;
  indexHtml: string;
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
        'import.meta.env.WAKU_CONFIG_ENTRIES_JS': JSON.stringify(
          opts.entriesJs,
        ),
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
