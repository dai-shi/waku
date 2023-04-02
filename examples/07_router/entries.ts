import path from "node:path";
import url from "node:url";

import { fileRouter } from "wakuwork/router/server";

export const { getEntry, prefetcher, prerenderer } = fileRouter(
  path.join(path.dirname(url.fileURLToPath(import.meta.url)), "routes")
);
