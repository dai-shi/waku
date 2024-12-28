import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

import { SRC_ENTRIES } from '../constants.js';
import { extname, joinPath } from '../utils/path.js';

const stripExt = (fname: string) => {
  const ext = extname(fname);
  return ext ? fname.slice(0, -ext.length) : fname;
};

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

export function rscEntriesPlugin(opts: {
  srcDir: string;
  ssrDir: string;
  moduleMap: Record<string, string>;
}): Plugin {
  const codeToPrepend = `
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
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
globalThis.__WAKU_SERVER_IMPORT__ = loadModule;
globalThis.__WAKU_CLIENT_IMPORT__ = (id) => loadModule('${opts.ssrDir}/' + id);
`;
  let entriesFile = '';
  let configFile = '';
  return {
    name: 'rsc-entries-plugin',
    configResolved(config) {
      config.build.rollupOptions.treeshake = {
        ...(typeof config.build.rollupOptions.treeshake === 'object'
          ? config.build.rollupOptions.treeshake
          : {}),
        // FIXME naive way to remove imports with unstable_viteConfigs.
        moduleSideEffects: 'no-external',
      };
      entriesFile = joinPath(config.root, opts.srcDir, SRC_ENTRIES);
      if (existsSync(CONFIG_FILE)) {
        configFile = normalizePath(path.resolve(CONFIG_FILE));
        codeToAppend += `
export const loadConfig = async () => (await import('${configFile}')).default;
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
      if (stripExt(id).endsWith(entriesFile)) {
        return code + codeToAppend;
      }
      if (id === configFile) {
        // FIXME we should parse code and process the AST properly
        return code.replace(
          /unstable_viteConfigs: {[^}]+}/,
          'unstable_viteConfigs: {}',
        );
      }
    },
  };
}
