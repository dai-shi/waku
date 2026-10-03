import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import playwright from 'eslint-plugin-playwright';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const basePath = fileURLToPath(new URL('.', import.meta.url));

const clientModules = [
  'packages/waku/src/client.ts',
  'packages/waku/src/minimal/client.ts',
  'packages/waku/src/minimal/client-runtime.tsx',
  'packages/waku/src/minimal/client-utils',
  'packages/waku/src/lib/utils-client',
  'packages/waku/src/lib/vite-entries/entry.browser.tsx',
];

const serverModules = [
  'packages/waku/src/server.ts',
  'packages/waku/src/minimal/server.ts',
  'packages/waku/src/lib/hono',
  'packages/waku/src/lib/utils-server',
  'packages/waku/src/lib/vite-entries/entry.server.tsx',
  'packages/waku/src/lib/vite-entries/entry.ssr.tsx',
  'packages/waku/src/lib/vite-rsc/handler.ts',
  'packages/waku/src/lib/vite-rsc/ssr.tsx',
];

export default defineConfig(
  {
    ignores: [
      '**/dist/',
      '**/.cache/',
      '**/.vercel/',
      '**/pages.gen.ts',
      'packages/create-waku/templates/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.eslint.json',
        },
      },
      react: { version: '999.999.999' },
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        globalThis: 'readonly',
        document: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      unicorn,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react/prop-types': 'off',
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
        },
      ],
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
          ],
          'newlines-between': 'never',
          pathGroups: [
            {
              pattern: 'react',
              group: 'builtin',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'unicorn/prefer-string-slice': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForStatement:not([init]):not([test]):not([update])',
          message: 'Use while (true) instead of for (;;).',
        },
        {
          selector: "TSQualifiedName[left.name='React']",
          message:
            'Import React types directly instead of using React.* namespace',
        },
      ],
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['e2e/**'],
  },
  {
    files: ['packages/waku/src/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          basePath,
          zones: [
            {
              target: [
                ...clientModules,
                ...serverModules,
                './packages/waku/src/lib/utils-isomorphic',
              ],
              from: './packages/waku/src/lib/utils-build',
              message: 'Build utilities must stay out of runtime utilities.',
            },
            {
              target: [
                ...clientModules,
                './packages/waku/src/lib/utils-isomorphic',
              ],
              from: './packages/waku/src/lib/utils-server',
              message:
                'Client and isomorphic utilities must not depend on server utilities.',
            },
            {
              target: [
                ...serverModules,
                './packages/waku/src/lib/utils-build',
                './packages/waku/src/lib/utils-isomorphic',
              ],
              from: './packages/waku/src/lib/utils-client',
              message: 'Browser runtime utilities must stay on the client.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      ...clientModules.map((path) =>
        path.endsWith('.ts') || path.endsWith('.tsx')
          ? path
          : `${path}/**/*.{ts,tsx}`,
      ),
      'packages/waku/src/lib/utils-isomorphic/**/*.{ts,tsx}',
    ],
    rules: {
      'import/no-nodejs-modules': 'error',
      'no-restricted-globals': ['error', 'Buffer', 'process'],
    },
  },
  {
    files: ['packages/waku/src/router/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          basePath,
          zones: [
            {
              target: './packages/waku/src/router',
              from: './packages/waku/src',
              except: ['./router'],
              message:
                'Use a public Waku entry point or a Router-local module.',
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^waku(?:$|/(?!minimal/(?:client|server)$|client$|server$))',
              message:
                'Router depends only on public Minimal, client, and server APIs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/waku/cli.js',
      'packages/waku/src/lib/vite-entries/*',
      'packages/waku/src/lib/vite-rsc/**/*',
      'packages/create-waku/cli.js',
    ],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
);
