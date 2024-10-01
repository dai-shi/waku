import type { Plugin } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { SRC_ENTRIES, EXTENSIONS } from '../constants.js';
import { joinPath } from '../utils/path.js';

const SRC_PAGES = 'pages';

const invalidCharRegex = /[^0-9a-zA-Z_$]/g;
const srcToName = (src: string) => {
  const split = src.split('/');
  const filename = split
    .at(-1)!
    .replace(/.tsx$/, '')
    .replace(invalidCharRegex, '')
    .replace('_layout', 'Layout');
  const entryPath =
    split.length > 1
      ? split.slice(0, -1).map((part) => {
          let _part = part;
          if (_part.startsWith('[...')) {
            _part = 'Wild_' + _part;
          }
          if (_part[0] === '[') {
            _part = 'Slug_' + _part;
          }
          _part = _part.replace(invalidCharRegex, '');
          return _part[0]!.toUpperCase() + _part.slice(1);
        })
      : [];
  return entryPath.join('') + filename[0]!.toUpperCase() + filename.slice(1);
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
      const collectFiles = async (
        dir: string,
        cwd: string = '',
        files: string[] = [],
      ): Promise<string[]> => {
        if (!cwd) {
          cwd = dir;
        }
        const entries = await readdir(cwd, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = joinPath(cwd, entry.name);
          if (entry.isDirectory()) {
            await collectFiles(dir, fullPath, files);
          } else {
            if (entry.name.endsWith('.tsx')) {
              files.push(fullPath.slice(dir.length));
            }
          }
        }
        return files;
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

          if (filePath.endsWith('/_layout.tsx')) {
            fileInfo.push({
              type: 'layout',
              path: filePath.replace('_layout.tsx', ''),
              src,
              hasGetConfig,
            });
          } else if (filePath.endsWith('/index.tsx')) {
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
