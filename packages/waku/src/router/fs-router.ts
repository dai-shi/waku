import { createPages } from './create-pages.js';

const DO_NOT_BUNDLE = '';

export function fsRouter(
  importMetaUrl: string,
  loader: (dir: string, file: string) => Promise<any>,
  pages = 'pages',
) {
  return createPages(
    async (
      { createPage, createLayout, unstable_setBuildData },
      { unstable_buildConfig },
    ) => {
      let files: string[];
      if (unstable_buildConfig) {
        // TODO FIXME this is toooooooo naive
        files = (unstable_buildConfig[0]!.customData as any).data;
      } else {
        // dev and build only
        const [
          { readdir },
          { join, dirname, extname, sep },
          { fileURLToPath },
        ] = await Promise.all([
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:fs/promises'),
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:path'),
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:url'),
        ]);
        const pagesDir = join(dirname(fileURLToPath(importMetaUrl)), pages);
        files = await readdir(pagesDir, {
          encoding: 'utf8',
          recursive: true,
        });
        files = files.flatMap((file) => {
          if (!['.tsx', '.js'].includes(extname(file))) {
            return [];
          }
          // HACK: replace "_slug_" to "[slug]"
          file = file.replace(/(^|\/|\\)_(\w+)_(\/|\\|\.)/g, '$1[$2]$3');
          if (sep === '/') {
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
        const path =
          '/' +
          (['_layout', 'index'].includes(pathItems.at(-1)!)
            ? pathItems.slice(0, -1)
            : pathItems
          ).join('/');
        unstable_setBuildData(path, files); // FIXME toooooo naive, not efficient
        if (pathItems.at(-1) === '_layout') {
          createLayout({
            path,
            component: mod.default,
            render: 'static',
            ...config,
          });
        } else {
          createPage({
            path,
            component: mod.default,
            render: 'dynamic',
            ...config,
          });
        }
      }
    },
  );
}
