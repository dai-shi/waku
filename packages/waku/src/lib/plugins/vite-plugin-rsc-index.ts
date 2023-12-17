import type { Plugin } from 'vite';

import { codeToInject } from '../renderers/utils.js';

export function rscIndexPlugin(options: {
  srcDir: string;
  mainJs: string;
  htmlHead: string;
  cssAssets?: string[];
}): Plugin {
  return {
    name: 'rsc-index-plugin',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res) => {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          const html = `
<!doctype html>
<html>
  <head>
${options.htmlHead}
<script src="/${options.srcDir}/${options.mainJs}" async type="module"></script>
  </head>
  <body>
  </body>
</html>
`;
          server.transformIndexHtml(req.url || '', html).then((html) => {
            res.end(html);
          });
        });
      };
    },
    async transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: codeToInject,
          injectTo: 'head-prepend',
        },
        ...(options.cssAssets || []).map((href) => ({
          tag: 'link',
          attrs: { rel: 'stylesheet', href },
          injectTo: 'head' as const,
        })),
      ];
    },
  };
}
