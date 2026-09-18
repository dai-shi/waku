import type { Plugin } from 'vite';

const RSDW_CLIENT_ID = 'react-server-dom-webpack/client';
const RSDW_CLIENT_EDGE_ID = 'react-server-dom-webpack/client.edge';
const RSDW_SERVER_EDGE_ID = 'react-server-dom-webpack/server.edge';

const virtualId = (source: string) => '\0' + source;

const isVitePluginRscImporter = (importer?: string) =>
  /(^|[/\\])@vitejs[/\\]plugin-rsc[/\\]/.test(importer || '');

export function patchRsdwPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:patch-rsdw',
    enforce: 'pre',
    resolveId(source, importer, _options) {
      if (source === RSDW_CLIENT_ID) {
        return virtualId(source);
      }
      if (
        (source === RSDW_CLIENT_EDGE_ID || source === RSDW_SERVER_EDGE_ID) &&
        !isVitePluginRscImporter(importer)
      ) {
        return virtualId(source);
      }
    },
    load(id) {
      if (id === virtualId(RSDW_CLIENT_ID)) {
        if (this.environment.name === 'client') {
          return `
              import * as ReactClient from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-rsc/browser'))};
              export default ReactClient;
            `;
        }
        return `export default {}`;
      }
      if (id === virtualId(RSDW_CLIENT_EDGE_ID)) {
        if (this.environment.name === 'rsc') {
          return `
            import { createFromReadableStream as createFromReadableStreamBase } from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-rsc/react/rsc/client'))};
            export function createFromReadableStream(stream) {
              return createFromReadableStreamBase(stream);
            }
          `;
        }
        return `export {}`;
      }
      if (id === virtualId(RSDW_SERVER_EDGE_ID)) {
        if (this.environment.name === 'rsc') {
          return `
            import { renderToReadableStream as renderToReadableStreamBase } from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-rsc/react/rsc/server'))};
            export function renderToReadableStream(model, _webpackMap, options) {
              return renderToReadableStreamBase(model, options);
            }
          `;
        }
        return `export {}`;
      }
    },
  };
}
