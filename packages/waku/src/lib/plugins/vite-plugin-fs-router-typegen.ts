import type { Plugin } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { SRC_ENTRIES, EXTENSIONS } from '../constants.js';
import { joinPath } from '../utils/path.js';
import * as swc from '@swc/core';

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
      if (part[0] === undefined) {
        return '';
      }
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
      outputFile = joinPath(config.root, opts.srcDir, 'pages.gen.ts');

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
        if (!pagesDir) {
          return false;
        }
        const file = swc.parseSync(readFileSync(pagesDir + filePath, 'utf8'), {
          syntax: 'typescript',
          tsx: true,
        });

        return file.body.some((node) => {
          if (node.type === 'ExportNamedDeclaration') {
            return node.specifiers.some(
              (specifier) =>
                specifier.type === 'ExportSpecifier' &&
                !specifier.isTypeOnly &&
                ((!specifier.exported &&
                  specifier.orig.value === 'getConfig') ||
                  specifier.exported?.value === 'getConfig'),
            );
          }

          return (
            node.type === 'ExportDeclaration' &&
            ((node.declaration.type === 'VariableDeclaration' &&
              node.declaration.declarations.some(
                (decl) =>
                  decl.id.type === 'Identifier' &&
                  decl.id.value === 'getConfig',
              )) ||
              (node.declaration.type === 'FunctionDeclaration' &&
                node.declaration.identifier.value === 'getConfig'))
          );
        });
      };

      const generateFile = (filePaths: string[]): string => {
        const fileInfo: { path: string; src: string; hasGetConfig: boolean }[] =
          [];
        const moduleNames = getImportModuleNames(filePaths);

        for (const filePath of filePaths) {
          // where to import the component from
          const src = filePath.replace(/^\//, '');
          const hasGetConfig = fileExportsGetConfig(filePath);

          if (filePath.endsWith('/_layout.tsx')) {
            continue;
          } else if (filePath.endsWith('/index.tsx')) {
            const path = filePath.slice(0, -'/index.tsx'.length);
            fileInfo.push({
              path: path || '/',
              src,
              hasGetConfig,
            });
          } else {
            fileInfo.push({
              path: filePath.replace('.tsx', ''),
              src,
              hasGetConfig,
            });
          }
        }

        let result = `import type { PathsForPages, GetConfigResponse } from 'waku/router';\n\n`;

        for (const file of fileInfo) {
          const moduleName = moduleNames[file.src];
          if (file.hasGetConfig) {
            result += `import type { getConfig as ${moduleName}_getConfig } from './${SRC_PAGES}/${file.src.replace('.tsx', '')}';\n`;
          }
        }

        result += `\ntype Page = {
  DO_NOT_USE_pages:`;

        for (const file of fileInfo) {
          const moduleName = moduleNames[file.src];
          if (file.hasGetConfig) {
            result += `| ({path: '${file.path}'} & GetConfigResponse<typeof ${moduleName}_getConfig>)\n`;
          } else {
            result += `| {path: '${file.path}'; render: 'dynamic'}\n`;
          }
        }

        result += `};

  declare module 'waku/router' {
    interface RouteConfig {
      paths: PathsForPages<Page>;
    }
    interface CreatePagesConfig {
      pages: Page;
    }
  }
  `;

        return result;
      };

      const updateGeneratedFile = async () => {
        if (!pagesDir || !outputFile) {
          return;
        }
        const files = await collectFiles(pagesDir);
        if (!files.length) {
          return;
        }
        const formatted = await formatter(generateFile(files));
        await writeFile(outputFile, formatted, 'utf-8');
      };

      server.watcher.on('change', async (file) => {
        if (!outputFile || outputFile.endsWith(file)) {
          return;
        }

        await updateGeneratedFile();
      });
      server.watcher.on('add', async (file) => {
        if (!outputFile || outputFile.endsWith(file)) {
          return;
        }

        await updateGeneratedFile();
      });

      void updateGeneratedFile();
    },
  };
};
