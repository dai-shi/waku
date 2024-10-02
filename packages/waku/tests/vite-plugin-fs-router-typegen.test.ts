import { describe, expect, test } from 'vitest';

import {
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/plugins/vite-plugin-fs-router-typegen.js';

describe('vite-plugin-fs-router-typegen', () => {
  test('generates valid module names for fs entries', async () => {
    expect(toIdentifier('/_layout.tsx')).toBe('Layout');
    expect(toIdentifier('/[category]/[...tags]/index.tsx')).toBe(
      'CategoryTagsIndex',
    );
  });

  test('allows unicode characters in module names', async () => {
    expect(toIdentifier('/øné_two_three.tsx')).toBe('ØnéTwoThree');
  });

  test('handles collisions of fs entry module names', async () => {
    expect(
      getImportModuleNames([
        '/one-two-three.tsx',
        '/one/two/three.tsx',
        '/one_two_three.tsx',
        '/one__two_three.tsx',
      ]),
    ).toEqual({
      '/one-two-three.tsx': 'OneTwoThree',
      '/one/two/three.tsx': 'OneTwoThree_6760f883',
      '/one_two_three.tsx': 'OneTwoThree_b7ec48bc',
      '/one__two_three.tsx': 'OneTwoThree_fb958a64',
    });
  });
});
