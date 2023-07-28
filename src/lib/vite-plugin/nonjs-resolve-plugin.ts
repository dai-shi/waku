import path from "node:path";
import type { Plugin } from "vite";

export function nonjsResolvePlugin(): Plugin {
  return {
    name: "nonjs-resolve-plugin",
    async resolveId(id, importer, options) {
      if (!id.endsWith(".js")) {
        return id;
      }
      for (const ext of [".js", ".ts", ".tsx", ".jsx"]) {
        const resolved = await this.resolve(
          id.slice(0, id.length - path.extname(id).length) + ext,
          importer,
          { ...options, skipSelf: true },
        );
        if (resolved) {
          return resolved;
        }
      }
    },
  };
}
