import type { Plugin } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { SRC_ENTRIES, EXTENSIONS } from '../constants.js';
import { joinPath } from '../utils/path.js';

const SRC_PAGES = 'pages';

// https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-names-and-keywords
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#identifiers
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words
export function toIdentifier(input: string): string {
  // Strip the file extension
  let identifier = input.includes('.')
    ? input.split('.').slice(0, -1).join('.')
    : input;
  // Replace any characters besides letters, numbers, underscores, and dollar signs with underscores
  identifier = identifier.replace(/[^\p{L}\p{N}_$]/gu, '_');
  // Ensure it starts with a letter
  if (/^\d/.test(identifier)) {
    identifier = '_' + identifier;
  }
  // Turn it into PascalCase
  // Since the first letter is uppercased, it will not be a reserved word
  return identifier
    .split('_')
    .map((part) => {
      if (part[0] === undefined) return '';
      return part[0].toUpperCase() + part.slice(1);
    })
    .join('');
}

export function getImportModuleNames(filePaths: string[]): {
  [k: string]: string;
} {
  const moduleNameCount: { [k: string]: number } = {};
  const moduleNames: { [k: string]: string } = {};
  for (const filePath of filePaths) {
    let identifier = toIdentifier(filePath);
    moduleNameCount[identifier] = (moduleNameCount[identifier] ?? -1) + 1;
    if (moduleNameCount[identifier]) {
      identifier = `${identifier}_${moduleNameCount[identifier]}`;
    }
    try {
      moduleNames[filePath.replace(/^\//, '')] = identifier;
    } catch (e) {
      console.log(e);
    }
  }
  return moduleNames;
}

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
        files: string[] = [],
      ): Promise<string[]> => {
        // TODO revisit recursive option for readdir once more stable
        // https://nodejs.org/docs/latest-v20.x/api/fs.html#direntparentpath
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = joinPath(dir, entry.name);
          if (entry.isDirectory()) {
            await collectFiles(fullPath, files);
          } else {
            if (entry.name.endsWith('.tsx')) {
              files.push(pagesDir ? fullPath.slice(pagesDir.length) : fullPath);
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
        const moduleNames = getImportModuleNames(filePaths);

        for (const filePath of filePaths) {
          // where to import the component from
          const src = filePath.replace(/^\//, '');
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
          const moduleName = moduleNames[file.src];
          result += `import ${moduleName}${file.hasGetConfig ? `, { getConfig as ${moduleName}_getConfig }` : ''} from './${SRC_PAGES}/${file.src.replace('.tsx', '')}';\n`;
        }

        result += `\nconst _pages = createPages(async (pagesFns) => [\n`;

        for (const file of fileInfo) {
          const moduleName = moduleNames[file.src];
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
