import path from "node:path";
import type { Plugin } from "vite";
import * as swc from "@swc/core";
import * as RSDWNodeLoader from "react-server-dom-webpack/node-loader";

export const rscTransformPlugin = (): Plugin => {
  return {
    name: "rsc-transform-plugin",
    async resolveId(id, importer, options) {
      if (!id.endsWith(".js")) {
        return id;
      }
      // FIXME This isn't necessary in production mode
      for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
        const resolved = await this.resolve(id.slice(0, -3) + ext, importer, {
          ...options,
          skipSelf: true,
        });
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
};

export const rscReloadPlugin = (fn: (type: "full-reload") => void): Plugin => {
  const isClientEntry = (id: string, code: string) => {
    const ext = path.extname(id);
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const mod = swc.parseSync(code, {
        syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
        tsx: ext === ".tsx",
      });
      for (const item of mod.body) {
        if (
          item.type === "ExpressionStatement" &&
          item.expression.type === "StringLiteral" &&
          item.expression.value === "use client"
        ) {
          return true;
        }
      }
    }
    return false;
  };
  return {
    name: "reload-plugin",
    async handleHotUpdate(ctx) {
      if (ctx.modules.length && !isClientEntry(ctx.file, await ctx.read())) {
        fn("full-reload");
      }
    },
  };
};
