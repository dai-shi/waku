import type { Plugin } from 'vite';

// In React 19.2.x, debug info that moveDebugInfoFromChunkToInnerValue has
// moved from a chunk onto its resolved value is not read back by
// flushComponentPerformance, so those chunks are missing from the Server
// Components performance track. This transform reads it back from the
// resolved value. React main includes an equivalent recovery.
//
// TODO: delete this transform once the recovery is in Waku's minimum React
// version. Investigation: https://github.com/facebook/react/issues/37116
const SEARCH = 'debugInfo = root._debugInfo;';
const REPLACE = `
${SEARCH}
if (debugInfo && 0 === debugInfo.length && "fulfilled" === root.status) {
  var _resolved = typeof resolveLazy === "function" ? resolveLazy(root.value) : root.value;
  if ("object" === typeof _resolved && null !== _resolved && isArrayImpl(_resolved._debugInfo)) {
    debugInfo = _resolved._debugInfo;
  }
}
`;

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
    transform(code, id) {
      const [file] = id.split('?');
      if (
        ![
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client__browser.js',
        ].some((suffix) => file!.endsWith(suffix))
      ) {
        return;
      }
      const patched = code.replace(SEARCH, REPLACE);
      if (patched === code) {
        return;
      }
      return patched;
    },
  };
}
