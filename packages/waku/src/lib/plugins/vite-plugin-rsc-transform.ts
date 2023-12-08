import type { Plugin } from 'vite';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';

export function rscTransformPlugin(
  isBuild: boolean,
  assetsDir?: string,
  clientEntryFiles?: Record<string, string>,
  serverEntryFiles?: Record<string, string>,
): Plugin {
  const clientFileMap = new Map(
    Object.entries(clientEntryFiles || {}).map(([k, v]) => [
      v,
      `@id/${assetsDir}/${k}.js`,
    ]),
  );
  const serverFileMap = new Map(
    Object.entries(serverEntryFiles || {}).map(([k, v]) => [
      v,
      `@id/${assetsDir}/${k}.js`,
    ]),
  );
  return {
    name: 'rsc-transform-plugin',
    async transform(code, id) {
      const resolve = async (
        specifier: string,
        { parentURL }: { parentURL: string },
      ) => {
        if (!specifier) {
          return { url: '' };
        }
        const url = (await this.resolve(specifier, parentURL, {
          skipSelf: true,
        }))!.id;
        return { url };
      };
      const load = async (url: string) => {
        let source = url === id ? code : (await this.load({ id: url })).code;
        // HACK move directives before import statements.
        source = source!.replace(
          /^(import {.*?} from ".*?";)\s*"use (client|server)";/,
          '"use $2";$1',
        );
        return { format: 'module', source };
      };
      RSDWNodeLoader.resolve(
        '',
        { conditions: ['react-server', 'workerd'], parentURL: '' },
        resolve,
      );
      let { source } = await RSDWNodeLoader.load(id, null, load);
      if (isBuild) {
        // TODO we should parse the source code by ourselves with SWC
        if (
          /^import {registerClientReference} from "react-server-dom-webpack\/server";/.test(
            source,
          )
        ) {
          const clientId = clientFileMap.has(id)
            ? `"${clientFileMap.get(id)}"`
            : 'import.meta.url';
          // HACK tweak registerClientReference for production
          source = source.replace(
            /registerClientReference\(function\(\) {throw new Error\("([^"]*)"\);},"[^"]*","([^"]*)"\);/gs,
            `registerClientReference(function() {return "$1";}, ${clientId}, "$2");`,
          );
        }
        if (
          /;import {registerServerReference} from "react-server-dom-webpack\/server";/.test(
            source,
          )
        ) {
          const serverId = serverFileMap.has(id)
            ? `"${serverFileMap.get(id)}"`
            : 'import.meta.url';
          // HACK tweak registerServerReference for production
          source = source.replace(
            /registerServerReference\(([^,]*),"[^"]*","([^"]*)"\);/gs,
            `registerServerReference($1, ${serverId}, "$2");`,
          );
        }
      }
      return source;
    },
  };
}
