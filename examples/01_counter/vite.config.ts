import url from "node:url";
import path from "node:path";
import { defineConfig } from "waku/config";

export default defineConfig({
  root: path.dirname(url.fileURLToPath(import.meta.url)),
});
