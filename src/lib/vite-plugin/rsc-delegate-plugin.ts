import path from "node:path";
import type { Plugin } from "vite";
import * as swc from "@swc/core";

// import { CSS_LANGS_RE } from "vite/dist/node/constants.js";
const CSS_LANGS_RE =
  /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export function rscDelegatePlugin(
  importCallback: (source: string) => void
): Plugin {
  let mode = "development";
  let base = "/";
  return {
    name: "rsc-delegate-plugin",
    configResolved(config) {
      mode = config.mode;
      base = config.base;
    },
    transform(code, id) {
      const ext = path.extname(id);
      if (
        mode === "development" &&
        [".ts", ".tsx", ".js", ".jsx"].includes(ext)
      ) {
        const mod = swc.parseSync(code, {
          syntax: ext === ".ts" || ext === ".tsx" ? "typescript" : "ecmascript",
          tsx: ext === ".tsx",
        });
        for (const item of mod.body) {
          if (item.type === "ImportDeclaration") {
            if (item.source.value.startsWith("virtual:")) {
              // HACK this relies on Vite's internal implementation detail.
              const source = base + "@id/__x00__" + item.source.value;
              importCallback(source);
            } else if (CSS_LANGS_RE.test(item.source.value)) {
              const filePath = path.join(path.dirname(id), item.source.value);
              // HACK this relies on Vite's internal implementation detail.
              const source = base + "@fs/" + filePath.replace(/^\//, "");
              importCallback(source);
            }
          }
        }
      }
      return code;
    },
  };
}
