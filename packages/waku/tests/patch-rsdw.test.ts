import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchRsdwPlugin } from '../src/lib/vite-plugins/patch-rsdw.js';

const require = createRequire(import.meta.url);

const readRsdwClientDevBundle = () => {
  const pkgJsonPath = require.resolve('react-server-dom-webpack/package.json');
  const bundlePath = join(
    dirname(pkgJsonPath),
    'cjs',
    'react-server-dom-webpack-client.browser.development.js',
  );
  return { id: bundlePath, code: readFileSync(bundlePath, 'utf8') };
};

const runTransform = (id: string, code: string): string | undefined => {
  const { transform } = patchRsdwPlugin();
  const fn = transform as
    ((code: string, id: string) => string | undefined) | undefined;
  return fn?.(code, id);
};

describe('patchRsdwPlugin', () => {
  it('still rewrites the installed react-server-dom-webpack client dev bundle', () => {
    const { id, code } = readRsdwClientDevBundle();
    const result = runTransform(id, code);
    // If a React upgrade changes these internals, the string match silently
    // no-ops and _debugInfo recovery for the Server Components performance
    // track is lost. Fail loudly here instead. See patch-rsdw.ts.
    expect(typeof result).toBe('string');
    expect(result).not.toBe(code);
    expect(result).toContain('root._debugInfo');
  });
});
