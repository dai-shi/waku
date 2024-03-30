import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

import { extname } from '../utils/path.js';

const stripExt = (fname: string) => {
  const ext = extname(fname);
  return ext ? fname.slice(0, -ext.length) : fname;
};

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

export function rscEntriesPlugin(opts: {
  entriesFile: string;
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
`;
  if (existsSync(CONFIG_FILE)) {
    const file = normalizePath(
      path.relative(path.dirname(opts.entriesFile), path.resolve(CONFIG_FILE)),
    );
    codeToAppend += `
export const loadConfig = async () => (await import('${file}')).default;
`;
  } else {
    codeToAppend += `
export const loadConfig = async () => ({});
`;
  }
  return {
    name: 'rsc-entries-plugin',
    transform(code, id) {
      if (
        // FIXME this is too hacky and not the right place to patch
        id.endsWith('/react-server-dom-webpack-server.edge.production.min.js')
      ) {
        return codeToPrepend + code;
      }
      if (stripExt(id) === stripExt(opts.entriesFile)) {
        return code + codeToAppend;
      }
    },
  };
}
