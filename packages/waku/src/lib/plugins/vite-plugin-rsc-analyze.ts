import path from 'node:path';
import type { Plugin } from 'vite';
import * as swc from '@swc/core';
import * as RSDWNodeLoader from 'react-server-dom-webpack/node-loader';
import { hash } from '../utils/crypto.js';
import type { ResolvedConfig } from '../config.js';

export type EntryFiles = Record<string, string>;

export function rscAnalyzePlugin(
  config: ResolvedConfig,
  clientEntryFiles: EntryFiles,
  serverEntryFiles: EntryFiles,
): Plugin[] {
  const clientEntryCallback = async (id: string) => {
    if (Object.values(clientEntryFiles).includes(id)) {
      return;
    }
    clientEntryFiles[
      `${config.assetsDir}/rsc${Object.keys(clientEntryFiles).length}-${await hash(id)}`
    ] = id;
  };
  const serverEntryCallback = (id: string) => {
    if (Object.values(serverEntryFiles).includes(id)) {
      return;
    }
    for (const [k, v] of Object.entries(clientEntryFiles)) {
      if (v === id) {
        serverEntryFiles[
          `${config.assetsDir}/rsf${Object.keys(serverEntryFiles).length}`
        ] = k;
      }
    }
  };

  const getClientId = async (id: string) => {
    for (const [k, v] of Object.entries(clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('client id not found: ' + id);
  };
  const getServerId = async (id: string) => {
    for (const [k, v] of Object.entries(clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('server id not found: ' + id);
  };

  return [
    {
      name: 'rsc-analyze-plugin:pre',
      enforce: 'pre',
      async transform(code, id, options) {
        const ext = path.extname(id);
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
          const mod = swc.parseSync(code, {
            syntax:
              ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
            tsx: ext === '.tsx',
          });
          for (const item of mod.body) {
            if (
              item.type === 'ExpressionStatement' &&
              item.expression.type === 'StringLiteral'
            ) {
              if (item.expression.value === 'use client') {
                await clientEntryCallback(id);
              } else if (item.expression.value === 'use server') {
                serverEntryCallback(id);
              }
            }
          }
        }
      },
    },
    {
      name: 'rsc-analyze-plugin',
      async transform(code, id, options) {
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

        // TODO we should parse the source code by ourselves with SWC
        if (
          /^import {registerClientReference} from "react-server-dom-webpack\/server";/.test(
            source,
          )
        ) {
          this.warn
          // HACK tweak registerClientReference for production
          source = source.replace(
            /registerClientReference\(function\(\) {throw new Error\("([^"]*)"\);},"[^"]*","([^"]*)"\);/gs,
            `registerClientReference(function() {return "$1";}, "${await getClientId(
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

        return source;
      },
    },
  ];
}
