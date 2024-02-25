import path from 'node:path';
import type { Plugin } from 'vite';
import * as swc from '@swc/core';

// HACK: Is it common to depend on another plugin like this?
import { rscTransformPlugin } from './vite-plugin-rsc-transform.js';

export function rscAnalyzePlugin(
  clientFileSet: Set<string>,
  serverFileSet: Set<string>,
): Plugin {
  const rscTransform = rscTransformPlugin({ isBuild: false }).transform;
  const clientEntryCallback = (id: string) => clientFileSet.add(id);
  const serverEntryCallback = (id: string) => serverFileSet.add(id);
  return {
    name: 'rsc-analyze-plugin',
    async transform(code, id, options) {
      const ext = path.extname(id);
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
          tsx: ext === '.tsx',
        });
        for (const item of mod.body) {
          if (
            item.type === 'ExpressionStatement' &&
            item.expression.type === 'StringLiteral'
          ) {
            if (item.expression.value === 'use client') {
              clientEntryCallback(id);
            } else if (item.expression.value === 'use server') {
              serverEntryCallback(id);
            }
          }
        }
      }
      // Avoid walking after the client boundary
      if (clientFileSet.has(id)) {
        // TODO this isn't efficient. let's refactor it in the future.
        return (
          rscTransform as typeof rscTransform & { handler: undefined }
        ).call(this, code, id, options);
      }
    },
  };
}
