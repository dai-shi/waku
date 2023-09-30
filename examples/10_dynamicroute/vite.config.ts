import url from "node:url";
import path from "node:path";

import { defineConfig } from "waku/config";

const modulesRoot = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "src",
);

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // FIXME this doesn't seem to provide nice output.
        // TODO we should use `input` instead.
        preserveModules: true,
        preserveModulesRoot: modulesRoot,
      },
    },
  },
});
