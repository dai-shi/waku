import eslint from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';

const compat = new FlatCompat();

export default tseslint.config(
  { ignores: ['**/dist/', 'packages/create-waku/template/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  ...compat.extends('plugin:react-hooks/recommended'),
  {
    settings: {
      'import/resolver': { typescript: true },
      react: { version: '999.999.999' },
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
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
    },
  },
  {
    files: [
      'packages/waku/cli.js',
      'packages/create-waku/cli.js',
      'examples/41_path-alias/**/*.tsx',
    ],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  { ignores: ['examples/44_cloudflare/.wrangler/'] },
);
