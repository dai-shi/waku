import type { Plugin } from 'vite';
import * as swc from '@swc/core';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';
import { parseOpts } from '../utils/swc.js';
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
  opts:
    | {
        isClient: true;
        serverFileSet: Set<string>;
      }
    | {
        isClient: false;
        clientFileSet: Set<string>;
        serverFileSet: Set<string>;
        fileHashMap: Map<string, string>;
      },
): Plugin {
  const rscTransform = rscTransformPlugin({
    isClient: false,
    isBuild: false,
  }).transform;
  return {
    name: 'rsc-analyze-plugin',
    async transform(code, id, options) {
      const ext = extname(id);
      if (EXTENSIONS.includes(ext)) {
        const mod = swc.parseSync(code, parseOpts(ext));
        for (const item of mod.body) {
          if (
            item.type === 'ExpressionStatement' &&
            item.expression.type === 'StringLiteral'
          ) {
            if (!opts.isClient && item.expression.value === 'use client') {
              opts.clientFileSet.add(id);
              opts.fileHashMap.set(id, await hash(code));
            } else if (item.expression.value === 'use server') {
              opts.serverFileSet.add(id);
            }
          }
        }
      }
      // Avoid walking after the client boundary
      if (!opts.isClient && opts.clientFileSet.has(id)) {
        // TODO this isn't efficient. let's refactor it in the future.
        return (
          rscTransform as typeof rscTransform & { handler: undefined }
        ).call(this, code, id, options);
      }
    },
  };
}
