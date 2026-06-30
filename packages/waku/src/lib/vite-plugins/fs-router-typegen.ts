// waku/router is technically a separate library from waku core.
// This file is an exception placed here so that fsRouter users
// get automatic type generation with better DX.

import { existsSync, readFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { parse, transformWithOxc } from 'vite';
import type { ParseResult, Plugin } from 'vite';
import { EXTENSIONS, SRC_PAGES, SRC_SERVER_ENTRY } from '../constants.js';
import { getGrouplessPath } from '../utils/create-pages.js';
import { isIgnoredPath } from '../utils/fs-router.js';
import { joinPath } from '../utils/path.js';

type ProgramNode = ParseResult['program'];
type ImportDeclaration = ProgramNode['body'][number] & {
  type: 'ImportDeclaration';
};
type ImportSpecifier = ImportDeclaration['specifiers'][number] & {
  type: 'ImportSpecifier';
};
type ExportNamedDeclaration = ProgramNode['body'][number] & {
  type: 'ExportNamedDeclaration';
};
type ExportSpecifier = ExportNamedDeclaration['specifiers'][number] & {
  type: 'ExportSpecifier';
};

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
  return (
    'File_' +
    identifier
      .split('_')
      .map((part) => {
        if (part[0] === undefined) {
          return '';
        }
        return part[0].toUpperCase() + part.slice(1);
      })
      .join('')
  );
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

const parseModule = async (filePath: string) => {
  const source = readFileSync(filePath, 'utf8');
  const lang: 'jsx' | 'ts' | 'tsx' = filePath.endsWith('.tsx')
    ? 'tsx'
    : filePath.endsWith('.ts')
      ? 'ts'
      : 'jsx';
  const transformed = await transformWithOxc(source, filePath, {
    lang,
    jsx: 'preserve',
  });
  return (await parse(filePath, transformed.code, { lang } as never)).program;
};

const getImportedName = (specifier: ImportSpecifier) =>
  specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : String(specifier.imported.value);

const getExportedName = (specifier: ExportSpecifier) =>
  specifier.exported.type === 'Identifier'
    ? specifier.exported.name
    : String(specifier.exported.value);

export const fsRouterTypegenPlugin = (opts: { srcDir: string }): Plugin => {
  return {
    name: 'waku:vite-plugins:fs-router-typegen',
    apply: 'serve',
    configureServer(server) {
      const srcDir = joinPath(server.config.root, opts.srcDir);
      const pagesDir = joinPath(srcDir, SRC_PAGES);

      const outputFile = joinPath(srcDir, 'pages.gen.ts');
      const updateGeneratedFile = async (file: string | undefined) => {
        // skip when the changed file is the generated file itself
        if (file && outputFile.endsWith(file)) {
          return;
        }
        // skip when the entries file exists or pages dir does not exist
        if (!existsSync(pagesDir) || !(await detectFsRouterUsage(srcDir))) {
          return;
        }
        const generation = await generateFsRouterTypes(pagesDir);
        if (!generation) {
          // skip failures
          return;
        }
        await writeFile(outputFile, generation, 'utf-8');
      };

      server.watcher.on('change', async (file) => {
        await updateGeneratedFile(file);
      });
      server.watcher.on('add', async (file) => {
        await updateGeneratedFile(file);
      });
      server.watcher.on('unlink', async (file) => {
        await updateGeneratedFile(file);
      });
      void updateGeneratedFile(undefined);
    },
  };
};

export async function detectFsRouterUsage(srcDir: string): Promise<boolean> {
  const existingServerEntry = EXTENSIONS.map((ext) =>
    joinPath(srcDir, SRC_SERVER_ENTRY + ext),
  ).find((entriesFile) => existsSync(entriesFile));

  // managed mode if no entry
  if (!existingServerEntry) {
    return true;
  }

  try {
    const file = await parseModule(existingServerEntry);
    const usesFsRouter = file.body.some((node) => {
      if (node.type !== 'ImportDeclaration') {
        return false;
      }
      if (
        node.source.type !== 'Literal' ||
        typeof node.source.value !== 'string' ||
        !node.source.value.startsWith('waku')
      ) {
        return false;
      }
      return node.specifiers.some((specifier) => {
        if (
          specifier.type !== 'ImportSpecifier' ||
          specifier.local.type !== 'Identifier'
        ) {
          return false;
        }
        return getImportedName(specifier) === 'fsRouter';
      });
    });
    return usesFsRouter;
  } catch {
    return false;
  }
}

export async function generateFsRouterTypes(pagesDir: string) {
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
          files.push(fullPath.slice(pagesDir.length));
        }
      }
    }
    return files;
  };

  const fileExportsGetConfig = async (filePath: string) => {
    const file = await parseModule(pagesDir + filePath);
    return file.body.some((node) => {
      if (node.type !== 'ExportNamedDeclaration') {
        return false;
      }
      if (
        node.declaration?.type === 'VariableDeclaration' &&
        node.declaration.declarations.some(
          (decl) =>
            decl.id.type === 'Identifier' && decl.id.name === 'getConfig',
        )
      ) {
        return true;
      }
      if (
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id?.name === 'getConfig'
      ) {
        return true;
      }
      return node.specifiers.some(
        (specifier) =>
          specifier.type === 'ExportSpecifier' &&
          getExportedName(specifier) === 'getConfig',
      );
    });
  };

  const generateFile = async (filePaths: string[]): Promise<string | null> => {
    const fileInfo: { path: string; src: string; hasGetConfig: boolean }[] = [];
    const layoutPaths: string[] = [];
    const moduleNames = getImportModuleNames(filePaths);

    for (const filePath of filePaths) {
      // where to import the component from
      const src = filePath.replace(/^\//, '');
      let hasGetConfig: boolean;
      try {
        hasGetConfig = await fileExportsGetConfig(filePath);
      } catch {
        return null;
      }

      if (isIgnoredPath(filePath.split('/'))) {
        continue;
      } else if (filePath.endsWith('/_layout.tsx')) {
        const path = filePath.slice(0, -'/_layout.tsx'.length);
        layoutPaths.push(getGrouplessPath(path) || '/');
      } else if (filePath.endsWith('/index.tsx')) {
        const path = filePath.slice(0, -'/index.tsx'.length);
        fileInfo.push({
          path: getGrouplessPath(path) || '/',
          src,
          hasGetConfig,
        });
      } else {
        fileInfo.push({
          path: getGrouplessPath(filePath.replace('.tsx', '')),
          src,
          hasGetConfig,
        });
      }
    }

    const hasAnyGetConfig = fileInfo.some((file) => file.hasGetConfig);
    const lines: string[] = [
      '// deno-fmt-ignore-file',
      '// biome-ignore format: generated types do not need formatting',
      '// prettier-ignore',
      hasAnyGetConfig
        ? "import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';"
        : "import type { PathsForPages } from 'waku/router';",
    ];

    if (hasAnyGetConfig) {
      lines.push('');
      for (const file of fileInfo) {
        if (!file.hasGetConfig) {
          continue;
        }
        const moduleName = moduleNames[file.src];
        lines.push(
          `// prettier-ignore`,
          `import type { getConfig as ${moduleName}_getConfig } from './${SRC_PAGES}/${file.src.replace('.tsx', '')}';`,
        );
      }
    }

    lines.push('', '// prettier-ignore', 'type Page =');
    for (const file of fileInfo) {
      const moduleName = moduleNames[file.src];
      if (file.hasGetConfig) {
        lines.push(
          `| ({ path: '${file.path}' } & GetConfigResponse<typeof ${moduleName}_getConfig>)`,
        );
      } else {
        lines.push(`| { path: '${file.path}'; render: 'static' }`);
      }
    }
    lines[lines.length - 1] += ';';

    const uniqueLayoutPaths = [...new Set(layoutPaths)];
    if (uniqueLayoutPaths.length) {
      lines.push('', '// prettier-ignore', 'type Layout =');
      for (const path of uniqueLayoutPaths) {
        lines.push(`| { path: '${path}' }`);
      }
      lines[lines.length - 1] += ';';
    }

    lines.push(
      '',
      '// prettier-ignore',
      "declare module 'waku/router' {",
      '  interface RouteConfig {',
      '    paths: PathsForPages<Page>;',
      '  }',
      '  interface CreatePagesConfig {',
      '    pages: Page;',
      ...(uniqueLayoutPaths.length ? ['    layouts: Layout;'] : []),
      '  }',
      ...(hasAnyGetConfig
        ? [
            '  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}',
          ]
        : []),
      '}',
      '',
    );

    const result = lines.join('\n');

    return result;
  };

  const files = (await collectFiles(pagesDir)).sort();
  if (!files.length) {
    return;
  }
  const generation = await generateFile(files);
  return generation;
}
