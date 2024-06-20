import type { ParseOptions, Options } from '@swc/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const transformServerActionsOpts = (ext: string): Options => {
  return {
    jsc: {
      target: 'esnext',
      parser: {
        syntax: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
        tsx: ext.endsWith('x'),
        jsx: ext.endsWith('x'),
      },
      experimental: {
        plugins: [
          [require.resolve('swc-plugin-react-server'), {
            isReactServerLayer: true,
            enabled: true
          }]
        ]
      }
    }
  }
}

export const parseOpts = (ext: string): ParseOptions => {
  if (ext === '.ts' || ext === '.tsx') {
    return {
      syntax: 'typescript',
      tsx: ext.endsWith('x'),
    }
  }
  // We hoped to use 'typescript' for everything, but it fails in some cases.
  // https://github.com/dai-shi/waku/issues/677
  return {
    syntax: 'ecmascript',
    jsx: ext.endsWith('x'),
  }
};
