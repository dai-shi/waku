import url from "node:url";
import path from "node:path";

import { defineConfig } from "waku/config";

const modulesRoot = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "src",
);

export default defineConfig({
  root: path.dirname(url.fileURLToPath(import.meta.url)),
  build: {
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: modulesRoot,
      },
    },
  },
});
