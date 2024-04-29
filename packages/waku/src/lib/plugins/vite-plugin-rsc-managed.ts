import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';

import { EXTENSIONS } from '../config.js';
import { extname, joinPath } from '../utils/path.js';

export const SRC_MAIN_JS = 'main.js';
export const SRC_ENTRIES = 'entries';

const resolveFileName = (fname: string) => {
  for (const ext of EXTENSIONS) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

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

const addSuffixX = (fname: string | undefined) => {
  if (!fname) {
    return fname;
  }
  if (fname.endsWith('x')) {
    return fname;
  }
  return fname + 'x';
};

export function rscManagedPlugin(opts: {
  basePath: string;
  srcDir: string;
  addEntriesToInput?: boolean;
  addMainToInput?: boolean;
}): Plugin {
  let entriesFile: string | undefined;
  let mainFile: string | undefined;
  const mainJsWithoutExt = SRC_MAIN_JS.replace(/\.js$/, '');
  const mainPath = `${opts.basePath}${opts.srcDir}/${mainJsWithoutExt}`;
  let managedEntries = false;
  let managedMain = false;
  return {
    name: 'rsc-managed-plugin',
    enforce: 'pre',
    configResolved(config) {
      entriesFile = joinPath(config.root, opts.srcDir, SRC_ENTRIES);
      mainFile = joinPath(config.root, opts.srcDir, SRC_MAIN_JS);
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
          ...(opts.addMainToInput && { main: resolveFileName(mainFile!) }),
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
      if (!resolved && id === mainFile) {
        managedMain = true;
        return addSuffixX(mainFile);
      }
      if (!resolved && stripExt(id) === mainPath) {
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
        (id === addSuffixX(mainFile) || id === mainPath + '.jsx')
      ) {
        return getManagedMain();
      }
    },
  };
}
