import path from "node:path";
import type { Plugin } from "vite";
import * as swc from "@swc/core";
import * as RSDWNodeLoader from "react-server-dom-webpack/node-loader";

import { codeToInject } from "./rsc-utils.js";

export function rscIndexPlugin(): Plugin {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: codeToInject,
          injectTo: "body",
        },
      ];
    },
  };
}

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

export function rscReloadPlugin(fn: (type: "full-reload") => void): Plugin {
  let enabled = false;
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
    configResolved(config) {
      if (config.mode === "development") {
        enabled = true;
      }
    },
    async handleHotUpdate(ctx) {
      if (!enabled) {
        return [];
      }
      if (ctx.modules.length && !isClientEntry(ctx.file, await ctx.read())) {
        fn("full-reload");
      } else {
        return [];
      }
    },
  };
}

export function rscAnalyzePlugin(
  clientEntryCallback: (id: string) => void,
  serverEntryCallback: (id: string) => void
): Plugin {
  return {
    name: "rsc-bundle-plugin",
    transform(code, id) {
      const ext = path.extname(id);
      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
          tsx: ext === ".tsx",
        });
        for (const item of mod.body) {
          if (
            item.type === "ExpressionStatement" &&
            item.expression.type === "StringLiteral"
          ) {
            if (item.expression.value === "use client") {
              clientEntryCallback(id);
            } else if (item.expression.value === "use server") {
              serverEntryCallback(id);
            }
          }
        }
      }
      return code;
    },
  };
}
