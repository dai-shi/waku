import type { Plugin } from 'vite';

import { validate } from 'react-server-action';
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
        const { fileType, error } = validate(code, id, !opts.isClient);
        if (error) {
          throw error;
        }
        switch (fileType) {
          case 'Client': {
            if (!opts.isClient) {
              opts.clientFileSet.add(id);
            }
            break;
          }
          case 'Server': {
            if (opts.isClient) {
              opts.serverFileSet.add(id);
            } else {
              opts.serverFileSet.add(id);
              opts.fileHashMap.set(id, await hash(code));
            }
            break;
          }
          case 'Isomorphic': {
            // we don't handle isomorphic files here
            break;
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
