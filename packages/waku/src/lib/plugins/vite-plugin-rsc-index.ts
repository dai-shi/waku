import type { Plugin } from 'vite';

import { codeToInject } from '../renderers/utils.js';

export function rscIndexPlugin(config: {
  basePath: string;
  srcDir: string;
  mainJs: string;
  htmlHead: string;
  indexHtml: string;
  cssAssets?: string[];
}): Plugin {
  const html = `
<!doctype html>
<html>
  <head>
${config.htmlHead}
  </head>
  <body>
    <script src="${config.basePath}${config.srcDir}/${config.mainJs}" async type="module"></script>
  </body>
</html>
`;
  return {
    name: 'rsc-index-plugin',
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
    config() {
      return {
        optimizeDeps: {
          entries: [`${config.srcDir}/${config.mainJs}`],
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
          indexHtml: config.indexHtml,
          ...options.input,
        },
      };
    },
    resolveId(id) {
      if (id === config.indexHtml) {
        return { id: config.indexHtml, moduleSideEffects: true };
      }
    },
    load(id) {
      if (id === config.indexHtml) {
        return html;
      }
    },
    transformIndexHtml() {
      return [
        // HACK without <base>, some relative assets don't work.
        // FIXME ideally, we should avoid this.
        { tag: 'base', attrs: { href: config.basePath } },
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: codeToInject,
        },
        ...(config.cssAssets || []).map((href) => ({
          tag: 'link',
          attrs: { rel: 'stylesheet', href },
          injectTo: 'head' as const,
        })),
      ];
    },
  };
}
