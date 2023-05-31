import url from "node:url";
import path from "node:path";
import { defineConfig } from "waku/config";
import { glob } from "glob";

const root = path.dirname(url.fileURLToPath(import.meta.url));
const customModules = Object.fromEntries(
  glob
    .sync(root + "/routes/**/*.tsx")
    .map((file) => [
      path.relative(
        root,
        file.slice(0, file.length - path.extname(file).length)
      ),
      url.fileURLToPath(new URL(file, import.meta.url)),
    ])
);

export default defineConfig(({ ssrBuild }) => ({
  root,
  build: {
    rollupOptions: {
      input: ssrBuild === true ? customModules : {},
    },
  },
}));
