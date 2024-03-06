import { joinPath, fileURLToFilePath } from '../lib/utils/path.js';
import { readdir } from '../lib/utils/node-fs.js';

import { createPages } from './create-pages.js';

export function fsRouter({
  importMetaUrl,
  pages = 'pages',
  loader,
}: {
  importMetaUrl: string;
  pages?: string; // default: 'pages'
  loader: (dir: string, file: string) => Promise<any>;
}) {
  const pagesDir = joinPath(fileURLToFilePath(importMetaUrl), '..', pages);
  return createPages(async ({ createPage, createLayout }) => {
    const files = await readdir(pagesDir, {
      encoding: 'utf8',
      recursive: true,
    });
    for (const file of files) {
      const mod = await loader(pages, file);
      const path = '/' + file.replace(/\.\w+$/, '');
      if (path.endsWith('/_layout')) {
        createLayout({
          path: path.slice(0, '/_layout'.length) || '/',
          component: mod.default,
          render: 'static',
          ...mod.config,
        });
      } else {
        createPage({
          path,
          component: mod.default,
          render: 'dyamic',
          ...mod.config,
        });
      }
    }
  });
}
