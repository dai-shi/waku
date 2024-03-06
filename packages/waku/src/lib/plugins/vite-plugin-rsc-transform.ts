import { transform } from '@swc/core';
import type { Plugin } from 'vite';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';
import { createRequire, type LoadHook, type ResolveHook } from 'node:module';
const require = createRequire(import.meta.url);

export function rscTransformPlugin(
  opts:
    | {
        isBuild: false;
      }
    | {
        isBuild: true;
        clientEntryFiles: Record<string, string>;
        serverEntryFiles: Record<string, string>;
      },
): Plugin {
  const getClientId = (id: string) => {
    if (!opts.isBuild) {
      throw new Error('not buiding');
    }
    for (const [k, v] of Object.entries(opts.clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    return null;
  };
  const getServerId = (id: string) => {
    if (!opts.isBuild) {
      throw new Error('not buiding');
    }
    for (const [k, v] of Object.entries(opts.serverEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    return null;
  };
  return {
    name: 'rsc-transform-plugin',
    async transform(code, id, options) {
      if (!options?.ssr) {
        return;
      }
      const resolve: ResolveHook = async (specifier: string, { parentURL }) => {
        if (!specifier) {
          return { url: '' };
        }
        const url = (await this.resolve(specifier, parentURL))!.id;
        return { url };
      };
      const resolveId = opts.isBuild
        ? getServerId(id) ?? getClientId(id) ?? id
        : id;
      const load: LoadHook = async (_: string) => {
        // `_` here is equivalent to `resolveId`, we use `id`
        //  to get the source code.
        let source = code;
        if (/\.[jt]sx?$/.test(id)) {
          source = (
            await transform(source, {
              swcrc: false,
              jsc: {
                experimental: {
                  plugins: [[require.resolve('swc-plugin-react-server'), {}]],
                },
              },
            })
          ).code;
        }
        return { format: 'module', source };
      };
      RSDWNodeLoader.resolve(
        '',
        { conditions: ['react-server', 'workerd'], parentURL: '' },
        resolve,
      );
      const { source } = await RSDWNodeLoader.load(resolveId, {}, load);
      return source;
    },
  };
}
