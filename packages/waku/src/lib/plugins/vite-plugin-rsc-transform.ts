import type { Plugin } from 'vite';
import * as swc from '@swc/core';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';
import { parseOpts } from '../utils/swc.js';

const transformClient = (
  code: string,
  id: string,
  getServerId: (id: string) => string,
) => {
  const ext = extname(id);
  const mod = swc.parseSync(code, parseOpts(ext));
  let hasUseServer = false;
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (
        item.expression.type === 'StringLiteral' &&
        item.expression.value === 'use server'
      ) {
        hasUseServer = true;
      }
    } else {
      break;
    }
  }
  if (hasUseServer) {
    const exportNames = new Set<string>();
    for (const item of mod.body) {
      if (item.type === 'ExportDeclaration') {
        if (item.declaration.type === 'FunctionDeclaration') {
          exportNames.add(item.declaration.identifier.value);
        } else if (item.declaration.type === 'VariableDeclaration') {
          for (const d of item.declaration.declarations) {
            if (d.id.type === 'Identifier') {
              exportNames.add(d.id.value);
            }
          }
        }
      } else if (item.type === 'ExportNamedDeclaration') {
        for (const s of item.specifiers) {
          if (s.type === 'ExportSpecifier') {
            exportNames.add(s.orig.value);
          }
        }
      } else if (item.type === 'ExportDefaultExpression') {
        exportNames.add('default');
      } else if (item.type === 'ExportDefaultDeclaration') {
        exportNames.add('default');
      }
    }
    let code = `
import { createServerReference } from 'react-server-dom-webpack/client';
import { callServerRSC } from 'waku/client';
`;
    for (const name of exportNames) {
      code += `
export ${name === 'default' ? name : `const ${name} =`} createServerReference('${getServerId(id)}#${name}', callServerRSC);
`;
    }
    return code;
  }
};

export function rscTransformPlugin(
  opts:
    | {
        isClient: true;
        isBuild: false;
      }
    | {
        isClient: true;
        isBuild: true;
        serverEntryFiles: Record<string, string>;
      }
    | {
        isClient: false;
        isBuild: false;
      }
    | {
        isClient: false;
        isBuild: true;
        clientEntryFiles: Record<string, string>;
        serverEntryFiles: Record<string, string>;
      },
): Plugin {
  const getClientId = (id: string) => {
    if (opts.isClient || !opts.isBuild) {
      throw new Error('not buiding for server');
    }
    for (const [k, v] of Object.entries(opts.clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
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
        return `@id/${k}.js`;
      }
    }
    throw new Error('server id not found: ' + id);
  };
  return {
    name: 'rsc-transform-plugin',
    async transform(code, id, options) {
      if (opts.isClient) {
        if (options?.ssr) {
          return;
        }
        if (!EXTENSIONS.includes(extname(id))) {
          return;
        }
        return transformClient(
          code,
          id,
          opts.isBuild ? getServerId : (id) => id,
        );
      }
      // isClient === false
      if (!options?.ssr) {
        return;
      }
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
          /^((?:import [^;]+;\s*)*)((?:"use [^"]+";\s*)*)/,
          '$2$1',
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
