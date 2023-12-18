import type { Plugin } from 'vite';

import { codeToInject } from '../renderers/utils.js';

export function rscIndexPlugin(config: {
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
<script src="/${config.srcDir}/${config.mainJs}" async type="module"></script>
  </head>
  <body>
  </body>
</html>
`;
  return {
    name: 'rsc-index-plugin',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res) => {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          server.transformIndexHtml(req.url || '', html).then((content) => {
            res.end(content);
          });
        });
      };
    },
    buildStart(options) {
      if (Array.isArray(options.input)) {
        throw new Error('array input is unsupported');
      }
      options.input.indexHtml = config.indexHtml;
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
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: codeToInject,
          injectTo: 'head-prepend',
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
