import { createPages } from './create-pages.js';

import { EXTENSIONS } from '../lib/config.js';

const DO_NOT_BUNDLE = '';

export function fsRouter(
  importMetaUrl: string,
  loadPage: (file: string) => Promise<any> | undefined,
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
          const myExt = extname(file);
          const myExtIndex = EXTENSIONS.indexOf(myExt);
          if (myExtIndex === -1) {
            return [];
          }
          // HACK: replace "_slug_" to "[slug]" for build
          file = file.replace(/(^|\/|\\)_([^/]+)_(\/|\\|\.)/g, '$1[$2]$3');
          // For Windows
          file = sep === '/' ? file : file.replace(/\\/g, '/');
          // HACK: resolve different extensions for build
          const exts = [myExt, ...EXTENSIONS];
          exts.splice(myExtIndex + 1, 1); // remove the second myExt
          for (const ext of exts) {
            const f = file.slice(0, -myExt.length) + ext;
            if (loadPage(f)) {
              return [f];
            }
          }
          throw new Error('Failed to resolve ' + file);
        });
      }
      for (const file of files) {
        const mod = await loadPage(file);
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
