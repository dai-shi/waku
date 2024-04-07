import type { Plugin } from 'vite';

import { EXTENSIONS } from '../config.js';
import { joinPath } from '../utils/path.js';

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
  entriesJs: string;
  mainJs?: string;
}): Plugin {
  let entriesFile: string | undefined;
  let mainFile: string | undefined;
  const mainJsPath = opts.mainJs && '/' + joinPath(opts.srcDir, opts.mainJs);
  let managedEntries = false;
  let managedMain = false;
  return {
    name: 'rsc-managed-plugin',
    enforce: 'pre',
    configResolved(config) {
      entriesFile = joinPath(config.root, opts.srcDir, opts.entriesJs);
      if (opts.mainJs) {
        mainFile = joinPath(config.root, opts.srcDir, opts.mainJs);
      }
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
