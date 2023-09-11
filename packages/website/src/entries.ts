import url from "node:url";
import path from "node:path";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

const routesDir = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes",
);

export default defineRouter(
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    const files = await glob(`${id}.{tsx,js}`, { cwd: routesDir });
    if (files.length === 0) {
      return null;
    }
    const items = id.split("/");
    switch (items.length) {
      case 1:
        return import(`./routes/${items[0]}.tsx`);
      case 2:
        return import(`./routes/${items[0]}/${items[1]}.tsx`);
      case 3:
        return import(`./routes/${items[0]}/${items[1]}/${items[2]}.tsx`);
      case 4:
        return import(
          `./routes/${items[0]}/${items[1]}/${items[2]}/${items[3]}.tsx`
        );
      default:
        throw new Error("too deep route");
    }
  },
  // getAllPaths
  async () => {
    const files = await glob("**/page.{tsx,js}", { cwd: routesDir });
    return files.map(
      (file) => "/" + file.slice(0, Math.max(0, file.lastIndexOf("/"))),
    );
  },
);
