import path from "node:path";
import url from "node:url";

import { fileRouter } from "wakuwork/router/server";

export default fileRouter(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes"
);
