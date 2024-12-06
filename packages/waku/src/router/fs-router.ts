import { unstable_getPlatformObject } from '../server.js';
import { new_createPages as createPages } from './create-pages.js';

import { EXTENSIONS } from '../lib/constants.js';

const DO_NOT_BUNDLE = '';

export function fsRouter(
  importMetaUrl: string,
  loadPage: (file: string) => Promise<any> | undefined,
  pages = 'pages',
) {
  const platformObject = unstable_getPlatformObject();
  return createPages(async ({ createPage, createLayout, createRoot }) => {
    let files: string[] | undefined = platformObject.buildData
      ?.fsRouterFiles as string[] | undefined;
    if (!files) {
      // dev and build only
      const [{ readdir }, { join, dirname, extname, sep }, { fileURLToPath }] =
        await Promise.all([
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:fs/promises'),
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:path'),
          import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:url'),
        ]);
      const pagesDir = join(dirname(fileURLToPath(importMetaUrl)), pages);
      files = await readdir(pagesDir, {
        encoding: 'utf8',
        recursive: true,
      });
      files = files!.flatMap((file) => {
        const myExt = extname(file);
        const myExtIndex = EXTENSIONS.indexOf(myExt);
        if (myExtIndex === -1) {
          return [];
        }
        // HACK: replace "_slug_" to "[slug]" for build
        file = file.replace(/(?<=^|\/|\\)_([^/]+)_(?=\/|\\|\.)/g, '[$1]');
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
    platformObject.buildData ||= {};
    platformObject.buildData.fsRouterFiles = files;
    for (const file of files) {
      const mod = await loadPage(file);
      const config = await mod.getConfig?.();
      const pathItems = file
        .replace(/\.\w+$/, '')
        .split('/')
        .filter(Boolean);
      const path =
        '/' +
        (['_layout', 'index', '_root'].includes(pathItems.at(-1)!)
          ? pathItems.slice(0, -1)
          : pathItems
        ).join('/');
      if (pathItems.at(-1) === '[path]') {
        throw new Error(
          'Page file cannot be named [path]. This will conflict with the path prop of the page component.',
        );
      } else if (pathItems.at(-1) === '_layout') {
        createLayout({
          path,
          component: mod.default,
          render: 'static',
          ...config,
        });
      } else if (pathItems.at(-1) === '_root') {
        createRoot({
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
    return []; // TODO this type support for fsRouter pages
  });
}
