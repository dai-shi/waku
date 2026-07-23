import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import playwright from 'eslint-plugin-playwright';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

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
