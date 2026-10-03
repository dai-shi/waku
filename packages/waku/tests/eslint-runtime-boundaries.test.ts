import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({
  cwd,
  overrideConfig: {
    languageOptions: {
      parserOptions: { project: false },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
});

const lint = async (file: string, code: string) => {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(cwd, 'packages/waku/src', file),
  });
  return result!.messages.map(({ ruleId }) => ruleId);
};

const lintImport = (file: string, dependency: string) => {
  const path = relative(dirname(file), dependency).split(sep).join('/');
  const specifier = path.startsWith('.') ? path : './' + path;
  return lint(
    file,
    `import * as utility from '${specifier}';\nvoid utility;\n`,
  );
};

test('client consumers import only client and isomorphic utilities', async () => {
  for (const file of [
    'client.ts',
    'minimal/client.ts',
    'minimal/client-runtime.tsx',
    'minimal/client-utils/root-store.ts',
    'lib/vite-entries/entry.browser.tsx',
  ]) {
    expect(await lintImport(file, 'lib/utils-isomorphic/log.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-client/initial-rsc.ts')).toEqual(
      [],
    );
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(
      await lint(file, "import * as fs from 'node:fs';\nvoid fs;\n"),
    ).toEqual(['import/no-nodejs-modules']);
    expect(await lint(file, "void import('fs');\n")).toEqual([
      'import/no-nodejs-modules',
    ]);
    expect(await lint(file, 'void process;\nvoid Buffer;\n')).toEqual([
      'no-restricted-globals',
      'no-restricted-globals',
    ]);
  }
  expect(
    await lint(
      'minimal/client-runtime.tsx',
      "export * from '../lib/utils-server/render.js';\n",
    ),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'lib/vite-entries/entry.browser.tsx',
      "void import('../utils-build/config.js');\n",
    ),
  ).toEqual(['import/no-restricted-paths']);
}, 60_000);

test('server consumers import only server and isomorphic utilities', async () => {
  for (const file of [
    'server.ts',
    'minimal/server.ts',
    'lib/hono/middleware.ts',
    'lib/vite-rsc/handler.ts',
    'lib/vite-rsc/ssr.tsx',
    'lib/vite-entries/entry.server.tsx',
    'lib/vite-entries/entry.ssr.tsx',
  ]) {
    expect(await lintImport(file, 'lib/utils-isomorphic/log.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-client/initial-rsc.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
  }
}, 60_000);

test('CLI and Vite tooling can import build and server utilities', async () => {
  for (const file of [
    'vite-plugins.ts',
    'lib/vite-rsc/loader.ts',
    'lib/vite-entries/entry.build.ts',
    'lib/vite-plugins/rsc-devtools.ts',
  ]) {
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([]);
  }
}, 60_000);

test('Router keeps its public API boundary', async () => {
  expect(
    await lintImport('router/client.tsx', 'lib/utils-isomorphic/log.ts'),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'router/client.tsx',
      "import * as minimal from 'waku/minimal/client';\nvoid minimal;\n",
    ),
  ).toEqual([]);
  expect(
    await lint(
      'router/client.tsx',
      "import * as internals from 'waku/internals';\nvoid internals;\n",
    ),
  ).toEqual(['no-restricted-imports']);
}, 60_000);
