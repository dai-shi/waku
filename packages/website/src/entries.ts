import url from "node:url";
import path from "node:path";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

const routesDir = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes",
);

export default defineRouter(
  (id) => {
    const items = id.split("/");
    switch (items.length) {
      case 1:
        return import(`./routes/${items[0]}.tsx`);
      case 2:
        return import(`./routes/${items[0]}/${items[1]}.tsx`);
      case 3:
        return import(`./routes/${items[0]}/${items[1]}/${items[2]}.tsx`);
      default:
        throw new Error("too deep route");
    }
  },
  async () => {
    const files = await glob("**/*.{tsx,js}", { cwd: routesDir });
    return files.map((file) => {
      const id = file.slice(0, file.length - path.extname(file).length);
      return id;
    });
  },
);
