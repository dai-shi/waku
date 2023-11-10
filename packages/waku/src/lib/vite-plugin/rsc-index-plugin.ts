import type { Plugin } from "vite";

// FIXME we should avoid external dependencies out of this file.
import { codeToInject } from "../middleware/rsc/utils.js";

export function rscIndexPlugin(cssAssets: string[]): Plugin {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", async: true },
          children: codeToInject,
          injectTo: "head-prepend",
        },
        ...cssAssets.map((href) => ({
          tag: "link",
          attrs: { rel: "stylesheet", href },
          injectTo: "head" as const,
        })),
      ];
    },
  };
}
