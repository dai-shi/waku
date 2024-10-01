import type { Plugin } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { SRC_ENTRIES, EXTENSIONS } from '../constants.js';
import { joinPath } from '../utils/path.js';

const SRC_PAGES = 'pages';

const srcToName = (src: string) => {
  const split = src
    .split('/')
    .map((part) => part[0]!.toUpperCase() + part.slice(1));

  if (split.at(-1) === '_layout.tsx') {
    return split.slice(0, -1).join('') + '_Layout';
  } else if (split.at(-1) === 'index.tsx') {
    return split.slice(0, -1).join('') + 'Index';
  } else if (split.at(-1)?.startsWith('[...')) {
    const fileName = split
      .at(-1)!
      .replace('-', '_')
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
      .replace('-', '_')
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
    const fileName = split.at(-1)!.replace('-', '_').replace('.tsx', '');
    return (
      split.slice(0, -1).join('') +
      fileName[0]!.toUpperCase() +
      fileName.slice(1)
    );
  }
};

export const fsRouterTypegenPlugin = (opts: { srcDir: string }): Plugin => {
  let entriesFilePossibilities: string[] | undefined;
  let pagesDir: string | undefined;
  let outputFile: string | undefined;
  let formatter = (s: string): Promise<string> => Promise.resolve(s);
  return {
    name: 'vite-plugin-fs-router-typegen',
    apply: 'serve',
    async configResolved(config) {
      pagesDir = joinPath(config.root, opts.srcDir, SRC_PAGES);
      entriesFilePossibilities = EXTENSIONS.map((ext) =>
        joinPath(config.root, opts.srcDir, SRC_ENTRIES + ext),
      );
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
      if (
        !entriesFilePossibilities ||
        !pagesDir ||
        !outputFile ||
        entriesFilePossibilities.some((entriesFile) =>
          existsSync(entriesFile),
        ) ||
        !existsSync(pagesDir)
      ) {
        return;
      }

      // Recursively collect `.tsx` files in the given directory
      const collectFiles = async (dir: string): Promise<string[]> => {
        if (!pagesDir) return [];
        const results: string[] = [];
        const files = await readdir(dir, {
          withFileTypes: true,
          recursive: true,
        });

        for (const file of files) {
          if (file.name.endsWith('.tsx')) {
            results.push('/' + file.name);
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

          if (filePath === '/_layout.tsx') {
            fileInfo.push({
              type: 'layout',
              path: filePath.replace('_layout.tsx', ''),
              src,
              hasGetConfig,
            });
          } else if (filePath === '/index.tsx') {
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
    interface CreatePagesConfig {
      pages: typeof _pages;
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
        if (!outputFile || outputFile.endsWith(file)) return;

        await updateGeneratedFile();
      });
      server.watcher.on('add', async (file) => {
        if (!outputFile || outputFile.endsWith(file)) return;

        await updateGeneratedFile();
      });

      void updateGeneratedFile();
    },
  };
};
