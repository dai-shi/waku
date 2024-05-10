import type { Plugin } from 'vite';

const patchRsdw = (code: string) => {
  code = code.replace(/__webpack_(\w+)__/g, '__waku_$1__');
  const index = code.indexOf('\nfunction requireAsyncModule');
  if (index === -1) {
    throw new Error('rscRsdwPlugin: Unexpected code structure');
  }
  code =
    code.slice(0, index) +
    `
globalThis.__waku_module_loading__ ||= new Map();
globalThis.__waku_module_cache__ ||= new Map();
globalThis.__waku_chunk_load__ ||= (id, customImport) => {
  if (!globalThis.__waku_module_loading__.has(id)) {
    globalThis.__waku_module_loading__.set(
      id,
      customImport
        ? customImport(id).then((m) => {
            globalThis.__waku_module_cache__.set(id, m);
          })
        : import(id).then((m) => {
            globalThis.__waku_module_cache__.set(id, m);
          })
    );
  }
  return globalThis.__waku_module_loading__.get(id);
};
globalThis.__waku_require__ ||= (id) => globalThis.__waku_module_cache__.get(id);
` +
    code.slice(index);
  return code;
};

export function rscRsdwPlugin(): Plugin {
  let mode: string;
  return {
    name: 'rsc-rsdw-plugin',
    enforce: 'pre',
    config(_config, env) {
      mode = env.mode;
    },
    resolveId(id, importer, options) {
      // HACK vite-plugin-commonjs does not work for this file
      if (id.endsWith('/react-server-dom-webpack/server.edge.js')) {
        id =
          id.slice(0, -'/server.edge.js'.length) +
          `/cjs/react-server-dom-webpack-server.edge.${mode === 'production' ? 'production' : 'development'}.js`;
        return this.resolve(id, importer, options);
      }
    },
    transform(code, id) {
      if (
        [
          '/react-server-dom-webpack-server.edge.production.js',
          '/react-server-dom-webpack-server.edge.development.js',
          '/react-server-dom-webpack-client.edge.production.js',
          '/react-server-dom-webpack-client.edge.development.js',
          '/react-server-dom-webpack-client.browser.production.js',
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client.js',
        ].some((suffix) => id.endsWith(suffix))
      ) {
        return patchRsdw(code);
      }
    },
  };
}
