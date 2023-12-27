import type { Plugin } from 'vite';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';

export function rscTransformPlugin(
  opts:
    | {
        isBuild: false;
      }
    | {
        isBuild: true;
        assetsDir: string;
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
        return `@id/${opts.assetsDir}/${k}.js`;
      }
    }
    throw new Error('client id not found: ' + id);
  };
  const getServerId = (id: string) => {
    if (!opts.isBuild) {
      throw new Error('not buiding');
    }
    for (const [k, v] of Object.entries(opts.serverEntryFiles)) {
      if (v === id) {
        return `@id/${opts.assetsDir}/${k}.js`;
      }
    }
    throw new Error('server id not found: ' + id);
  };
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
        const url = (await this.resolve(specifier, parentURL))!.id;
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
      if (opts.isBuild) {
        // TODO we should parse the source code by ourselves with SWC
        if (
          /^import {registerClientReference} from "react-server-dom-webpack\/server";/.test(
            source,
          )
        ) {
          // HACK tweak registerClientReference for production
          source = source.replace(
            /registerClientReference\(function\(\) {throw new Error\("([^"]*)"\);},"[^"]*","([^"]*)"\);/gs,
            `registerClientReference(function() {return "$1";}, "${getClientId(
              id,
            )}", "$2");`,
          );
        }
        if (
          /;import {registerServerReference} from "react-server-dom-webpack\/server";/.test(
            source,
          )
        ) {
          // HACK tweak registerServerReference for production
          source = source.replace(
            /registerServerReference\(([^,]*),"[^"]*","([^"]*)"\);/gs,
            `registerServerReference($1, "${getServerId(id)}", "$2");`,
          );
        }
      }
      return source;
    },
  };
}
