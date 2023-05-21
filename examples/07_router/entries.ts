import path from "node:path";
import url from "node:url";

import { fileRouter } from "wakuwork/router/server";

export const { getEntry, getBuilder, getCustomModules } = fileRouter(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes"
);
