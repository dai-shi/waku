import type { Plugin } from 'vite';

const patchRsdw = (code: string) => {
  code = code.replace(/__webpack_(\w+)__/g, '__waku_$1__');
  code += `
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
`;
  return code;
};

export function rscRsdwPlugin(): Plugin {
  return {
    name: 'rsc-rsdw-plugin',
    transform(code, id) {
      const file = id.split('?')[0]!;
      if (
        [
          '/react-server-dom-webpack-server.edge.production.js',
          '/react-server-dom-webpack-server.edge.development.js',
          '/react-server-dom-webpack-client.edge.production.js',
          '/react-server-dom-webpack-client.edge.development.js',
          '/react-server-dom-webpack-client.browser.production.js',
          '/react-server-dom-webpack-client.browser.development.js',
          '/react-server-dom-webpack_client.js',
        ].some((suffix) => file.endsWith(suffix))
      ) {
        return patchRsdw(code);
      }
    },
  };
}
