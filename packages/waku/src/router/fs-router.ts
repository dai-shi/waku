import { joinPath, fileURLToFilePath, extname } from '../lib/utils/path.js';
import { readdir } from '../lib/utils/node-fs.js';

import { createPages } from './create-pages.js';

export function fsRouter(
  importMetaUrl: string,
  loader: (dir: string, file: string) => Promise<any>,
  pages = 'pages',
) {
  const pagesDir = joinPath(fileURLToFilePath(importMetaUrl), '..', pages);
  return createPages(async ({ createPage, createLayout }) => {
    const files = await readdir(pagesDir, {
      encoding: 'utf8',
      recursive: true,
    });
    for (const file of files) {
      if (!['.tsx', '.js'].includes(extname(file))) {
        continue;
      }
      // HACK: replace "_slug_" to "[slug]"
      const fname = file.replace(/(^|\/)_(\w+)_(\/|\.)/g, '$1[$2]$3');
      const mod = await loader(pages, fname);
      const config = await mod.getConfig?.();
      const pathItems = fname
        .replace(/\.\w+$/, '')
        .split('/')
        .filter(Boolean);
      if (pathItems.at(-1) === '_layout') {
        createLayout({
          path: '/' + pathItems.slice(0, -1).join('/'),
          component: mod.default,
          render: 'static',
          ...config,
        });
      } else {
        createPage({
          path:
            '/' +
            (pathItems.at(-1) === 'index'
              ? pathItems.slice(0, -1)
              : pathItems
            ).join('/'),
          component: mod.default,
          render: 'dynamic',
          ...config,
        });
      }
    }
  });
}
