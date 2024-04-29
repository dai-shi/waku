import type { Plugin } from 'vite';

import { EXTENSIONS } from '../config.js';
import { extname, joinPath } from '../utils/path.js';

export const SRC_MAIN = 'main';
export const SRC_ENTRIES = 'entries';

const stripExt = (fname: string) => {
  const ext = extname(fname);
  return ext ? fname.slice(0, -ext.length) : fname;
};

const getManagedEntries = () => `
import { fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.url,
  (file) => import.meta.glob('./pages/**/*.{${EXTENSIONS.map((ext) =>
    ext.replace(/^\./, ''),
  ).join(',')}}')[\`./pages/\${file}\`]?.(),
);
`;

const getManagedMain = () => `
import { Component, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

if (document.body.dataset.hydrate) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
`;

export function rscManagedPlugin(opts: {
  basePath: string;
  srcDir: string;
  addEntriesToInput?: boolean;
  addMainToInput?: boolean;
}): Plugin {
  let entriesFile: string | undefined;
  let mainFile: string | undefined;
  const mainPath = `${opts.basePath}${opts.srcDir}/${SRC_MAIN}`;
  let managedEntries = false;
  let managedMain = false;
  return {
    name: 'rsc-managed-plugin',
    enforce: 'pre',
    configResolved(config) {
      entriesFile = joinPath(config.root, opts.srcDir, SRC_ENTRIES);
      mainFile = joinPath(config.root, opts.srcDir, SRC_MAIN);
    },
    options(options) {
      if (typeof options.input === 'string') {
        throw new Error('string input is unsupported');
      }
      if (Array.isArray(options.input)) {
        throw new Error('array input is unsupported');
      }
      return {
        ...options,
        input: {
          ...(opts.addEntriesToInput && { entries: entriesFile! }),
          ...(opts.addMainToInput && { main: mainFile! }),
          ...options.input,
        },
      };
    },
    async resolveId(id, importer, options) {
      const resolved = await this.resolve(id, importer, options);
      if ((!resolved || resolved.id === id) && id === entriesFile) {
        managedEntries = true;
        return entriesFile + '.jsx';
      }
      if ((!resolved || resolved.id === id) && id === mainFile) {
        managedMain = true;
        return mainFile + '.jsx';
      }
      if ((!resolved || resolved.id === id) && stripExt(id) === mainPath) {
        managedMain = true;
        return mainPath + '.jsx';
      }
      return resolved;
    },
    load(id) {
      if (managedEntries && id === entriesFile + '.jsx') {
        return getManagedEntries();
      }
      if (
        managedMain &&
        (id === mainFile + '.jsx' || id === mainPath + '.jsx')
      ) {
        return getManagedMain();
      }
    },
  };
}
