import type { Plugin } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SRC_ENTRIES, SRC_PAGES } from '../constants.js';
import { joinPath } from '../utils/path.js';

const srcToName = (src: string) => {
  const split = src
    .split('/')
    .map((part) => (part[0]!.toUpperCase() + part.slice(1)).replace('-', '_'));

  if (src.endsWith('_layout.tsx')) {
    return split.slice(0, -1).join('') + '_Layout';
  } else if (src.endsWith('index.tsx')) {
    return split.slice(0, -1).join('') + 'Index';
  } else if (split.at(-1)?.startsWith('[...')) {
    const fileName = split
      .at(-1)!
      .replace('.tsx', '')
      .replace('[...', '')
      .replace(']', '');
    return (
      split.slice(0, -1).join('') +
      'Wild' +
      fileName[0]!.toUpperCase() +
      fileName.slice(1)
    );
  } else if (split.at(-1)?.startsWith('[')) {
    const fileName = split
      .at(-1)!
      .replace('.tsx', '')
      .replace('[', '')
      .replace(']', '');
    return (
      split.slice(0, -1).join('') +
      'Slug' +
      fileName[0]!.toUpperCase() +
      fileName.slice(1)
    );
  } else {
    const fileName = split.at(-1)!.replace('.tsx', '');
    return (
      split.slice(0, -1).join('') +
      fileName[0]!.toUpperCase() +
      fileName.slice(1)
    );
  }
};

export const fsRouterTypegenPlugin = (opts: { srcDir: string }): Plugin => {
  let entriesFile: string | undefined;
  let pagesDir: string | undefined;
  let outputFile: string | undefined;
  let formatter = (s: string): Promise<string> => Promise.resolve(s);
  return {
    name: 'vite-plugin-fs-router-typegen',
    apply: 'serve',
    async configResolved(config) {
      pagesDir = joinPath(config.root, opts.srcDir, SRC_PAGES);
      entriesFile = joinPath(config.root, opts.srcDir, `${SRC_ENTRIES}.tsx`);
      outputFile = joinPath(config.root, opts.srcDir, `${SRC_ENTRIES}.gen.tsx`);

      try {
        const prettier = await import('prettier');
        // Get user's prettier config
        const config = await prettier.resolveConfig(outputFile);

        formatter = (s) =>
          prettier.format(s, { ...config, parser: 'typescript' });
      } catch {
        // ignore
      }
    },
    configureServer(server) {
      if (!entriesFile || !pagesDir || !outputFile || existsSync(entriesFile)) {
        return;
      }

      // Recursively collect `.tsx` files in the given directory
      const collectFiles = async (dir: string): Promise<string[]> => {
        if (!pagesDir) return [];
        let results: string[] = [];
        const files = await readdir(dir, { withFileTypes: true });

        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            results = results.concat(await collectFiles(fullPath));
          } else if (file.isFile() && fullPath.endsWith('.tsx')) {
            results.push(fullPath.replace(pagesDir, ''));
          }
        }
        return results;
      };

      const fileExportsGetConfig = (filePath: string) => {
        if (!pagesDir) return false;
        const file = readFileSync(pagesDir + filePath).toString();

        return (
          file.includes('const getConfig') ||
          file.includes('function getConfig')
        );
      };

      const generateFile = (filePaths: string[]): string => {
        const fileInfo = [];
        for (const filePath of filePaths) {
          // where to import the component from
          const src = filePath.slice(1);
          const hasGetConfig = fileExportsGetConfig(filePath);

          if (filePath.endsWith('_layout.tsx')) {
            fileInfo.push({
              type: 'layout',
              path: filePath.replace('_layout.tsx', ''),
              src,
              hasGetConfig,
            });
          } else if (filePath.endsWith('index.tsx')) {
            fileInfo.push({
              type: 'page',
              path: filePath.replace('index.tsx', ''),
              src,
              hasGetConfig,
            });
          } else {
            fileInfo.push({
              type: 'page',
              path: filePath.replace('.tsx', ''),
              src,
              hasGetConfig,
            });
          }
        }

        let result = `import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';\n\n`;

        for (const file of fileInfo) {
          const moduleName = srcToName(file.src);
          result += `import ${moduleName}${file.hasGetConfig ? `, { getConfig as ${moduleName}_getConfig }` : ''} from './${SRC_PAGES}/${file.src.replace('.tsx', '')}';\n`;
        }

        result += `\nconst _pages = createPages(async (pagesFns) => [\n`;

        for (const file of fileInfo) {
          const moduleName = srcToName(file.src);
          result += `  pagesFns.${file.type === 'layout' ? 'createLayout' : 'createPage'}({ path: '${file.path}', component: ${moduleName}, ${file.hasGetConfig ? `...(await ${moduleName}_getConfig())` : `render: '${file.type === 'layout' ? 'static' : 'dynamic'}'`} }),\n`;
        }

        result += `]);
  
  declare module 'waku/router' {
    interface RouteConfig {
      paths: PathsForPages<typeof _pages>;
    }
  }

  export default _pages;
  `;

        return result;
      };

      const updateGeneratedFile = async () => {
        if (!pagesDir || !outputFile) return;
        const files = await collectFiles(pagesDir);
        const formatted = await formatter(generateFile(files));
        await writeFile(outputFile, formatted, 'utf-8');
      };

      server.watcher.add(opts.srcDir);
      server.watcher.on('change', async (file) => {
        if (file === outputFile) return;

        await updateGeneratedFile();
      });
      server.watcher.on('add', async (file) => {
        if (file === outputFile) return;

        await updateGeneratedFile();
      });

      server.watcher.on('', async (file) => {
        if (file === outputFile) return;

        await updateGeneratedFile();
      });

      void updateGeneratedFile();
    },
  };
};
