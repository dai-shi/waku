import type { Plugin } from 'vite';

// HACK Depending on a different plugin isn't ideal.
// Maybe we could put in vite config object?
import { SRC_MAIN_JS } from './vite-plugin-rsc-managed.js';

import { codeToInject } from '../renderers/utils.js';

export function rscIndexPlugin(opts: {
  basePath: string;
  srcDir: string;
  htmlAttrs: string;
  htmlHead: string;
  cssAssets?: string[];
}): Plugin {
  const indexHtml = 'index.html';
  const mainJsWithoutExt = SRC_MAIN_JS.replace(/\.js$/, '');
  const html = `
<!doctype html>
<html${opts.htmlAttrs ? ' ' + opts.htmlAttrs : ''}>
  <head>
${opts.htmlHead}
  </head>
  <body>
    <script src="${opts.basePath}${opts.srcDir}/${mainJsWithoutExt}" async type="module"></script>
  </body>
</html>
`;
  return {
    name: 'rsc-index-plugin',
    config() {
      return {
        optimizeDeps: {
          entries: [`${opts.srcDir}/${mainJsWithoutExt}.*`],
        },
      };
    },
    options(options) {
      if (typeof options.input === 'string') {
        throw new Error('string input is unsupported');
      }
      if (Array.isArray(options.input)) {
        throw new Error('array input is unsupported');
      }
      return {
        ...options,
        input: {
          indexHtml,
          ...options.input,
        },
      };
    },
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res) => {
          server
            .transformIndexHtml(req.url || '', html)
            .then((content) => {
              res.statusCode = 200;
              res.setHeader('content-type', 'text/html; charset=utf-8');
              res.end(content);
            })
            .catch((err) => {
              console.error('Error transforming index.html', err);
              res.statusCode = 500;
              res.end('Internal Server Error');
            });
        });
      };
    },
    resolveId(id) {
      if (id === indexHtml) {
        return { id: indexHtml, moduleSideEffects: true };
      }
    },
    load(id) {
      if (id === indexHtml) {
        return html;
      }
    },
    transformIndexHtml() {
      return [
        // HACK without <base>, some relative assets don't work.
        // FIXME ideally, we should avoid this.
        { tag: 'base', attrs: { href: opts.basePath } },
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: codeToInject,
        },
        ...(opts.cssAssets || []).map((href) => ({
          tag: 'link',
          attrs: { rel: 'stylesheet', href },
          injectTo: 'head' as const,
        })),
      ];
    },
  };
}
