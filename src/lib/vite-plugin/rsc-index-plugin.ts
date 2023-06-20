import type { Plugin } from "vite";

// FIXME we should avoid external dependencies out of this file.
import { codeToInject } from "../middleware/rsc/utils.js";

export function rscIndexPlugin(): Plugin {
  return {
    name: "rsc-index-plugin",
    async transformIndexHtml() {
      return [
        {
          tag: "script",
          children: codeToInject,
          injectTo: "head",
        },
      ];
    },
  };
}
