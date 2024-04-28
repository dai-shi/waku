import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';

import { EXTENSIONS } from '../config.js';
import { extname, joinPath } from '../utils/path.js';

export const SRC_MAIN_JS = 'main.js';
export const SRC_ENTRIES_JS = 'entries.js';

const resolveFileName = (fname: string) => {
  for (const ext of EXTENSIONS) {
    const resolvedName = fname.slice(0, -extname(fname).length) + ext;
    if (existsSync(resolvedName)) {
      return resolvedName;
    }
  }
  return fname; // returning the default one
};

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

const getManagedEntries = () => `
import { fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.url,
  (file) => import.meta.glob('./pages/**/*.{${EXTENSIONS.map((ext) =>
    ext.replace(/^\./, ''),
  ).join(',')}}')[\`./pages/\${file}\`]?.(),
);
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
  srcDir: string;
  addEntriesJsToInput?: boolean;
  addMainJsToInput?: boolean;
}): Plugin {
  let entriesFile: string | undefined;
  let mainFile: string | undefined;
  const mainJsPath = '/' + joinPath(opts.srcDir, SRC_MAIN_JS);
  let managedEntries = false;
  let managedMain = false;
  return {
    name: 'rsc-managed-plugin',
    enforce: 'pre',
    configResolved(config) {
      entriesFile = resolveFileName(
        joinPath(config.root, opts.srcDir, SRC_ENTRIES_JS),
      );
      mainFile = resolveFileName(
        joinPath(config.root, opts.srcDir, SRC_MAIN_JS),
      );
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
          ...(opts.addEntriesJsToInput &&
            entriesFile && { entries: entriesFile }),
          ...(opts.addMainJsToInput && mainFile && { main: mainFile }),
          ...options.input,
        },
      };
    },
    async resolveId(id, importer, options) {
      const resolved = await this.resolve(id, importer, options);
      if (!resolved && id === entriesFile) {
        managedEntries = true;
        return addSuffixX(id);
      }
      if (!resolved && (id === mainFile || id === mainJsPath)) {
        managedMain = true;
        return addSuffixX(id);
      }
      return resolved;
    },
    load(id) {
      if (managedEntries && id === addSuffixX(entriesFile)) {
        return getManagedEntries();
      }
      if (
        managedMain &&
        (id === addSuffixX(mainFile) || id === addSuffixX(mainJsPath))
      ) {
        return getManagedMain();
      }
    },
  };
}
