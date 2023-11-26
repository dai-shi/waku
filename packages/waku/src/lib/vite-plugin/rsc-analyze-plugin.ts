import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';
import * as swc from '@swc/core';

export function rscAnalyzePlugin(
  commonFileSet: Set<string>,
  clientEntryFileSet: Set<string>,
  serverEntryFileSet: Set<string>,
): Plugin {
  const dependencyMap = new Map<string, Set<string>>();
  const clientEntryCallback = (id: string) => clientEntryFileSet.add(id);
  const serverEntryCallback = (id: string) => serverEntryFileSet.add(id);
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
    async transform(code, id) {
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
      return code;
    },
    generateBundle(_options, bundle) {
      // TODO the logic in this function should probably be redesigned.
      const outputIds = Object.values(bundle).flatMap((item) =>
        'facadeModuleId' in item && item.facadeModuleId
          ? [item.facadeModuleId]
          : [],
      );
      const possibleCommonFileMap = new Map<
        string,
        { fromClient?: true; notFromClient?: true }
      >();
      const seen = new Set<string>();
      const loop = (id: string, isClient: boolean) => {
        if (seen.has(id)) {
          return;
        }
        seen.add(id);
        isClient = isClient || clientEntryFileSet.has(id);
        dependencyMap.get(id)?.forEach((depId) => {
          if (!fs.existsSync(depId)) {
            // HACK is there a better way?
            return;
          }
          let value = possibleCommonFileMap.get(depId);
          if (!value) {
            value = {};
            possibleCommonFileMap.set(depId, value);
          }
          if (isClient) {
            value.fromClient = true;
          } else {
            value.notFromClient = true;
          }
          loop(depId, isClient);
        });
      };
      outputIds.forEach((id) => loop(id, false));
      clientEntryFileSet.forEach((id) => loop(id, true));
      serverEntryFileSet.forEach((id) => loop(id, false));
      for (const [id, val] of possibleCommonFileMap) {
        if (val.fromClient && val.notFromClient) {
          commonFileSet.add(id);
        }
      }
      clientEntryFileSet.forEach((id) => commonFileSet.delete(id));
      serverEntryFileSet.forEach((id) => commonFileSet.delete(id));
    },
  };
}
