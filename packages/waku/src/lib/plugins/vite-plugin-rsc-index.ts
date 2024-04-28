import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

import { codeToInject } from '../renderers/utils.js';

export function rscIndexPlugin(opts: {
  basePath: string;
  srcDir: string;
  mainJs: string;
  htmlHead: string;
  cssAssets?: string[];
}): Plugin {
  const indexHtml = 'index.html';
  const html = `
<!doctype html>
<html>
  <head>
${opts.htmlHead}
  </head>
  <body>
    <script src="${opts.basePath}${opts.srcDir}/${opts.mainJs}" async type="module"></script>
  </body>
</html>
`;
  let managedIndexHtml = false;
  return {
    name: 'rsc-index-plugin',
    config() {
      return {
        optimizeDeps: {
          entries: [`${opts.srcDir}/${opts.mainJs}`.replace(/\.js$/, '.*')],
        },
      };
    },
    configResolved(config) {
      if (!existsSync(path.join(config.root, indexHtml))) {
        managedIndexHtml = true;
      }
    },
    options(options) {
      if (managedIndexHtml) {
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
      }
    },
    configureServer(server) {
      if (managedIndexHtml) {
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
      }
    },
    resolveId(id) {
      if (managedIndexHtml && id === indexHtml) {
        return { id: indexHtml, moduleSideEffects: true };
      }
    },
    load(id) {
      if (managedIndexHtml && id === indexHtml) {
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
