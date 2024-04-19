import type { Plugin } from 'vite';
import * as swc from '@swc/core';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';
// HACK: Is it common to depend on another plugin like this?
import { rscTransformPlugin } from './vite-plugin-rsc-transform.js';

const hash = async (code: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 9);
};

export function rscAnalyzePlugin(
  clientFileSet: Set<string>,
  serverFileSet: Set<string>,
  fileHashMap: Map<string, string>,
): Plugin {
  const rscTransform = rscTransformPlugin({ isBuild: false }).transform;
  const clientEntryCallback = (id: string) => clientFileSet.add(id);
  const serverEntryCallback = (id: string) => serverFileSet.add(id);
  return {
    name: 'rsc-analyze-plugin',
    async transform(code, id, options) {
      const ext = extname(id);
      if (EXTENSIONS.includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: 'typescript',
          tsx: ext.endsWith('x'),
        });
        // to fix the issue that the directive is not at the top of the file
        let isDirective = true;
        
        for (const item of mod.body) {
          if (
            item.type === 'ExpressionStatement' &&
            item.expression.type === 'StringLiteral'
          ) {
            if (item.expression.value === 'use client') {
              if (!isDirective) {
                const e = {
                  messageText:
                    'The `"use client"` directive must be put at the top of the file.',
                }
                throw e;
              } else {
                clientEntryCallback(id);
                fileHashMap.set(id, await hash(code));
              }
            } else if (item.expression.value === 'use server') {
              if (!isDirective) {
                const e = {
                  messageText:
                    'The `"use server"` directive must be put at the top of the file.',
                }
                throw e
              } else {
                serverEntryCallback(id); 
              }
            }
          } else {
            isDirective = false;
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
