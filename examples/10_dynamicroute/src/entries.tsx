import url from "node:url";
import path from "node:path";
import fs from "node:fs";
import { lazy } from "react";
import { glob } from "glob";
import { defineRouter } from "waku/router/server";

const routesDir = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes",
);

const getRoute = (items: string[]) =>
  lazy(() => {
    // HACK: replace "_slug_" to "[slug]"
    items = items.map((item) => item.replace(/^_(\w+)_$/, "[$1]"));
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
  });

// HACK for vite dev server
const isReservedId = (id: string) =>
  id.startsWith("@") || id.startsWith("main.tsx/");

export default defineRouter(
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    if (isReservedId(id)) {
      return null;
    }
    const mapping: Record<string, string> = {};
    const items = id.split("/");
    for (let i = 0; i < items.length - 1; ++i) {
      const dir = path.join(routesDir, ...items.slice(0, i));
      if (!fs.existsSync(dir)) {
        return null;
      }
      const files = fs.readdirSync(dir);
      if (!files.includes(items[i]!)) {
        const slug = files.find((file) => file.match(/^(\[\w+\]|_\w+_)$/));
        if (slug) {
          mapping[slug.slice(1, -1)] = items[i]!;
          items[i] = slug;
        }
      }
    }
    if (
      !fs.existsSync(path.join(routesDir, ...items) + ".js") &&
      !fs.existsSync(path.join(routesDir, ...items) + ".tsx")
    ) {
      return null;
    }
    const Route = getRoute(items);
    const Component = (props: Record<string, unknown>) => (
      <Route {...props} {...mapping} />
    );
    return Component;
  },
  // getPathsForBuild
  async () => {
    const files = await glob("**/page.{tsx,js}", { cwd: routesDir });
    return files
      .filter((file) => !/(^|\/)(\[\w+\]|_\w+_)\//.test(file))
      .map((file) => "/" + file.slice(0, Math.max(0, file.lastIndexOf("/"))));
  },
);
