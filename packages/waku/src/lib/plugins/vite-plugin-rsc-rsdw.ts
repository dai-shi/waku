import type { Plugin } from 'vite';
import * as swc from '@swc/core';

const patchRsdw = (code: string, type: 'SERVER' | 'CLIENT') => {
  code = code.replace(
    /__webpack_(\w+)__/g,
    (_, p1) => `__WAKU_${type}_${p1.toUpperCase()}__`,
  );
  const index = code.indexOf('function requireAsyncModule(id)');
  if (index === -1) {
    throw new Error('rscRsdwPlugin: Unexpected code structure');
  }

  return code.replaceAll(
    'function requireAsyncModule(id)',
    `
globalThis.__WAKU_${type}_MODULE_LOADING__ ||= new Map();
globalThis.__WAKU_${type}_MODULE_CACHE__ ||= new Map();
globalThis.__WAKU_${type}_CHUNK_LOAD__ ||= (id) => {
  if (!globalThis.__WAKU_${type}_MODULE_LOADING__.has(id)) {
    globalThis.__WAKU_${type}_MODULE_LOADING__.set(
      id,
      globalThis.__WAKU_${type}_IMPORT__(id).then((m) => {
        globalThis.__WAKU_${type}_MODULE_CACHE__.set(id, m);
      })
    );
  }
  return globalThis.__WAKU_${type}_MODULE_LOADING__.get(id);
};
globalThis.__WAKU_${type}_REQUIRE__ ||= (id) => globalThis.__WAKU_${type}_MODULE_CACHE__.get(id);
function requireAsyncModule(id)
`,
  );
};

export function rscRsdwPlugin(): Plugin {
  let mode: string;
  return {
    name: 'rsc-rsdw-plugin',
    enforce: 'pre',
    config(_config, env) {
      mode = env.mode;
    },
    async resolveId(id, importer, options) {
      if (id === 'react-server-dom-webpack/client.edge') {
        const resolved = await this.resolve(id, importer, options);
        if (resolved) {
          id = resolved.id;
        }
      }
      if (id.endsWith('/react-server-dom-webpack/client.edge.js')) {
        id =
          id.slice(0, -'/client.edge.js'.length) +
          `/cjs/react-server-dom-webpack-client.edge.${mode === 'production' ? 'production' : 'development'}.js`;
        return this.resolve(id, importer, options);
      }
    },
    transform(code, id) {
      const [file, opt] = id.split('?');
      if (
        ['commonjs-exports', 'commonjs-proxy', 'commonjs-entry'].includes(opt!)
      ) {
        return;
      }
      if (
        [
          '/react-server-dom-webpack-server.edge.production.js',
          '/react-server-dom-webpack-server.edge.development.js',
          '/react-server-dom-webpack_server__edge.js',
        ].some((suffix) => file!.endsWith(suffix))
      ) {
        return swc.transformSync(patchRsdw(code, 'SERVER'), {
          sourceMaps: true,
        });
      }
      if (
        [
          '/react-server-dom-webpack-client.edge.production.js',
          '/react-server-dom-webpack-client.edge.development.js',
          '/react-server-dom-webpack-client.browser.production.js',
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client.js',
          '/react-server-dom-webpack_client__edge.js',
        ].some((suffix) => file!.endsWith(suffix))
      ) {
        return swc.transformSync(patchRsdw(code, 'CLIENT'), {
          sourceMaps: true,
        });
      }
      if (code.includes('function requireAsyncModule(id)')) {
        throw new Error('rscRsdwPlugin: Untransformed file: ' + file);
      }
    },
  };
}
