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
  // TODO this is unused. a leftover in #490. remove it.
  const dependencyMap = new Map<string, Set<string>>();
  const clientEntryCallback = (id: string) => clientFileSet.add(id);
  const serverEntryCallback = (id: string) => serverFileSet.add(id);
  const dependencyCallback = (id: string, depId: string) => {
    let depSet = dependencyMap.get(id);
    if (!depSet) {
      depSet = new Set();
      dependencyMap.set(id, depSet);
    }
    depSet.add(depId);
  };
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
          if (item.type === 'ImportDeclaration') {
            const resolvedId = await this.resolve(item.source.value, id);
            if (resolvedId) {
              dependencyCallback(id, resolvedId.id);
            }
          }
        }
      }
      // TODO this isn't efficient. let's refactor it in the future.
      return (rscTransform as any).call(this, code, id, options);
    },
  };
}
