import path from "node:path";
import fs from "node:fs";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";
import { unstable_rootDir as rootDir } from "waku/config";

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
    const root = rootDir();
    const routesDir = path.join(root, "src", "routes");
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
