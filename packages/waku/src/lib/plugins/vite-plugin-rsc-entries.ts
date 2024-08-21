import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

// HACK Depending on a different plugin isn't ideal.
// Maybe we could put in vite config object?
import { SRC_ENTRIES } from './vite-plugin-rsc-managed.js';

import { extname, joinPath } from '../utils/path.js';

const stripExt = (fname: string) => {
  const ext = extname(fname);
  return ext ? fname.slice(0, -ext.length) : fname;
};

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

export function rscEntriesPlugin(opts: {
  srcDir: string;
  moduleMap: Record<string, string>;
}): Plugin {
  const codeToPrepend = `
try {
  globalThis.AsyncLocalStorage = (await import('node:async_hooks')).AsyncLocalStorage;
} catch (e) {}
`;
  let codeToAppend = `
export function loadModule(id) {
  switch (id) {
    ${Object.entries(opts.moduleMap)
      .map(([k, v]) => `case '${k}': return import('' + '${v}');`)
      .join('\n')}
    default: throw new Error('Cannot find module: ' + id);
  }
}
globalThis.__WAKU_SERVER_HACK_IMPORT__ = loadModule;
`;
  let entriesFile = '';
  return {
    name: 'rsc-entries-plugin',
    configResolved(config) {
      entriesFile = joinPath(config.root, opts.srcDir, SRC_ENTRIES);
      if (existsSync(CONFIG_FILE)) {
        const file = normalizePath(
          path.relative(path.dirname(entriesFile), path.resolve(CONFIG_FILE)),
        );
        codeToAppend += `
export const loadConfig = async () => (await import('${file}')).default;
`;
      } else {
        codeToAppend += `
export const loadConfig = async () => ({});
`;
      }
    },
    transform(code, id) {
      if (
        // FIXME this is too hacky and not the right place to patch
        id.endsWith('/react-server-dom-webpack-server.edge.production.js')
      ) {
        return codeToPrepend + code;
      }
      if (stripExt(id) === entriesFile) {
        return code + codeToAppend;
      }
    },
  };
}
