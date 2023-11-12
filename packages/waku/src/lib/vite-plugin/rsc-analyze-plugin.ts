import path from "node:path";
import type { Plugin } from "vite";
import * as swc from "@swc/core";

export function rscAnalyzePlugin(
  clientEntryCallback: (id: string) => void,
  serverEntryCallback: (id: string) => void,
): Plugin {
  return {
    name: "rsc-analyze-plugin",
    transform(code, id) {
      const ext = path.extname(id);
      if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
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
