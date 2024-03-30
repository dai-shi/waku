import type { Plugin } from 'vite';

import { joinPath } from '../utils/path.js';

const getManagedMain = () => `
import { Component, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if ('error' in this.state) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

const rootElement = (
  <StrictMode>
    <ErrorBoundary fallback={(error) => <h1>{String(error)}</h1>}>
      <Router />
    </ErrorBoundary>
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

export default fsRouter(import.meta.url, loader);

function loader(dir, file) {
  const fname = \`./\${dir}/\${file.replace(/\\.\\w+$/, '')}.tsx\`;
  const modules = import.meta.glob('./pages/**/*.tsx');
  return modules[fname]();
}
`;

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
        return id;
      }
      if (!resolved && (id === mainFile || id === mainJsPath)) {
        managedMain = true;
        return id;
      }
      return resolved;
    },
    load(id) {
      if (managedEntries && id === entriesFile) {
        return getManagedEntries();
      }
      if (managedMain && (id === mainFile || id === mainJsPath)) {
        return getManagedMain();
      }
    },
  };
}
