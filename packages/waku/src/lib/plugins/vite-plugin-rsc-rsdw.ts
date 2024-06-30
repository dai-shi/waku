import type { Plugin } from 'vite';

const patchRsdw = (code: string) => {
  code = code.replace(
    /__webpack_(\w+)__/g,
    (_, p1) => `__WAKU_${p1.toUpperCase()}__`,
  );
  const index = code.indexOf('function requireAsyncModule(id)');
  if (index === -1) {
    throw new Error('rscRsdwPlugin: Unexpected code structure');
  }
  code =
    code.slice(0, index) +
    `
globalThis.__WAKU_MODULE_LOADING__ ||= new Map();
globalThis.__WAKU_MODULE_CACHE__ ||= new Map();
globalThis.__WAKU_CHUNK_LOAD__ ||= (id, customImport) => {
  if (!globalThis.__WAKU_MODULE_LOADING__.has(id)) {
    globalThis.__WAKU_MODULE_LOADING__.set(
      id,
      customImport
        ? customImport(id).then((m) => {
            globalThis.__WAKU_MODULE_CACHE__.set(id, m);
          })
        : globalThis.__waku_hackImport(id).then((m) => {
            globalThis.__WAKU_MODULE_CACHE__.set(id, m);
          })
    );
  }
  return globalThis.__WAKU_MODULE_LOADING__.get(id);
};
globalThis.__WAKU_REQUIRE__ ||= (id) => globalThis.__WAKU_MODULE_CACHE__.get(id);
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
        !['commonjs-exports', 'commonjs-proxy', 'commonjs-entry'].includes(
          opt!,
        ) &&
        [
          '/react-server-dom-webpack-server.edge.production.js',
          '/react-server-dom-webpack-server.edge.development.js',
          '/react-server-dom-webpack_server__edge.js',
          '/react-server-dom-webpack-client.edge.production.js',
          '/react-server-dom-webpack-client.edge.development.js',
          '/react-server-dom-webpack-client.browser.production.js',
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client.js',
        ].some((suffix) => file!.endsWith(suffix))
      ) {
        return patchRsdw(code);
      }
    },
  };
}
