import type { Plugin } from 'vite';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';

export function rscTransformPlugin(
  isBuild: boolean,
  assetsDir?: string,
  clientEntryFiles?: Record<string, string>,
  serverEntryFiles?: Record<string, string>,
): Plugin {
  const clientFileMap = new Map<string, string>();
  const serverFileMap = new Map<string, string>();
  const getClientId = (id: string) => {
    if (!assetsDir) {
      throw new Error('assetsDir is required');
    }
    if (!clientFileMap.has(id)) {
      throw new Error(`Cannot find client id for ${id}`);
    }
    return `@id/${assetsDir}/${clientFileMap.get(id)}.js`;
  };
  const getServerId = (id: string) => {
    if (!assetsDir) {
      throw new Error('assetsDir is required');
    }
    if (!serverFileMap.has(id)) {
      throw new Error(`Cannot find server id for ${id}`);
    }
    return `@id/${assetsDir}/${serverFileMap.get(id)}.js`;
  };
  let buildStarted = false;
  return {
    name: 'rsc-transform-plugin',
    async buildStart() {
      for (const [k, v] of Object.entries(clientEntryFiles || {})) {
        const resolvedId = await this.resolve(v);
        if (!resolvedId) {
          throw new Error(`Cannot resolve ${v}`);
        }
        clientFileMap.set(resolvedId.id, k);
      }
      for (const [k, v] of Object.entries(serverEntryFiles || {})) {
        serverFileMap.set(v, k);
      }
      // HACK Without checking buildStarted in transform,
      // this.resolve calls transform, and getClientId throws an error.
      buildStarted = true;
    },
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
      if (isBuild && buildStarted) {
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
