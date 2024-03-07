import { createPages } from './create-pages.js';

export function fsRouter(
  importMetaUrl: string,
  loader: (dir: string, file: string) => Promise<any>,
  pages = 'pages',
) {
  return createPages(
    async ({ createPage, createLayout }, { unstable_buildPaths }) => {
      let files: string[];
      if (unstable_buildPaths) {
        files = unstable_buildPaths.map((pathSpec) =>
          pathSpec
            .map((item) => {
              if (!item.name) {
                throw new Error('[Bug] No name in pathSpec');
              }
              return item.name;
            })
            .join('/'),
        );
      } else {
        // dev and build only
        const [{ readdir }, path, { fileURLToPath }] = await Promise.all([
          import('node:fs/promises'),
          import('node:path'),
          import('node:url'),
        ]);
        const pagesDir = path.join(
          path.dirname(fileURLToPath(importMetaUrl)),
          pages,
        );
        files = await readdir(pagesDir, {
          encoding: 'utf8',
          recursive: true,
        });
        files = files.flatMap((file) => {
          if (!['.tsx', '.js'].includes(path.extname(file))) {
            return [];
          }
          // HACK: replace "_slug_" to "[slug]"
          file = file.replace(/(^|\/)_(\w+)_(\/|\.)/g, '$1[$2]$3');
          if (path.sep === '/') {
            return [file];
          }
          // For Windows
          return [file.replace(/\\/g, '/')];
        });
      }
      for (const file of files) {
        const mod = await loader(pages, file);
        const config = await mod.getConfig?.();
        const pathItems = file
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
    },
  );
}
