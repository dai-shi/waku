import path from "node:path";
import type { Plugin } from "vite";
import * as swc from "@swc/core";

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
    name: "rsc-reload-plugin",
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
