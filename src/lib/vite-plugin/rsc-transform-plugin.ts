import path from "node:path";
import type { Plugin } from "vite";
import * as RSDWNodeLoader from "react-server-dom-webpack/node-loader";

export function rscTransformPlugin(): Plugin {
  return {
    name: "rsc-transform-plugin",
    async resolveId(id, importer, options) {
      if (!id.endsWith(".js")) {
        return id;
      }
      // FIXME This isn't necessary in production mode
      // (But, waku/router may depend on this.)
      for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
        const resolved = await this.resolve(
          id.slice(0, id.length - path.extname(id).length) + ext,
          importer,
          { ...options, skipSelf: true }
        );
        if (resolved) {
          return resolved;
        }
      }
    },
    async transform(code, id) {
      const resolve = async (
        specifier: string,
        { parentURL }: { parentURL: string }
      ) => {
        if (!specifier) {
          return { url: "" };
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
          '"use $2";$1'
        );
        return { format: "module", source };
      };
      RSDWNodeLoader.resolve(
        "",
        { conditions: ["react-server"], parentURL: "" },
        resolve
      );
      return (await RSDWNodeLoader.load(id, null, load)).source;
    },
  };
}
