import path from "node:path";
import fs from "node:fs";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

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
  async (root) => {
    const routesDir = path.join(root, "routes");
    const files = await glob("**/*.tsx", { cwd: routesDir });
    return files.map((file) => {
      const name = file.slice(0, file.length - path.extname(file).length);
      const stat = fs.statSync(path.join(routesDir, name), {
        throwIfNoEntry: false,
      });
      return stat?.isDirectory() ? name + "/" : name;
    });
  }
);
