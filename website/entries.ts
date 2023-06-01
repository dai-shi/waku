import path from "node:path";
import fs from "node:fs";
import url from "node:url";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

const root = path.dirname(url.fileURLToPath(import.meta.url));
const routesDir = path.join(root, "routes");

export default defineRouter(
  (id) => {
    const items = id.split("/");
    switch (items.length) {
      case 1:
        return import(`./routes/${items[0]}.tsx`);
      case 2:
        return import(`./routes/${items[0]}/${items[1]}.tsx`);
      default:
        throw new Error("too deep route");
    }
  },
  async () =>
    (await glob("**/*.js", { cwd: routesDir })).map((file) => {
      const name = file.slice(0, file.length - path.extname(file).length);
      const stat = fs.statSync(path.join(routesDir, name), {
        throwIfNoEntry: false,
      });
      return stat?.isDirectory() ? name + "/" : name;
    })
);
