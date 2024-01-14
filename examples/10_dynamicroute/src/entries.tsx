import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { lazy } from 'react';
import { glob } from 'glob';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';

const routesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'routes',
);

const getRoute = (items: string[]) =>
  lazy(() => {
    // HACK: replace "_slug_" to "[slug]"
    items = items.map((item) => item.replace(/^_(\w+)_$/, '[$1]'));
    switch (items.length) {
      case 1:
        return import(`./routes/${items[0]}.tsx`);
      case 2:
        return import(`./routes/${items[0]}/${items[1]}.tsx`);
      case 3:
        return import(`./routes/${items[0]}/${items[1]}/${items[2]}.tsx`);
      default:
        throw new Error('too deep route');
    }
  });

const getMappingAndItems = async (id: string) => {
  const mapping: Record<string, string> = {};
  const items = id.split('/');
  for (let i = 0; i < items.length - 1; ++i) {
    const dir = path.join(routesDir, ...items.slice(0, i));
    if (!existsSync(dir)) {
      return null;
    }
    const files = await fsPromises.readdir(dir);
    if (!files.includes(items[i]!)) {
      const slug = files.find((file) => file.match(/^(\[\w+\]|_\w+_)$/));
      if (slug) {
        mapping[slug.slice(1, -1)] = items[i]!;
        items[i] = slug;
      }
    }
  }
  if (
    !existsSync(path.join(routesDir, ...items) + '.js') &&
    !existsSync(path.join(routesDir, ...items) + '.tsx')
  ) {
    return null;
  }

  return { mapping, items };
};

const getStaticPaths = async () => {
  const files = await glob('**/page.{tsx,js}', { cwd: routesDir });
  return files
    .filter((file) => !/(^|\/)(\[\w+\]|_\w+_)\//.test(file))
    .map((file) => '/' + file.slice(0, Math.max(0, file.lastIndexOf('/'))));
};

export default defineRouter(
  // existsPath
  async (path: string) => {
    if ((await getStaticPaths()).includes(path)) {
      return 'static';
    }
    if ((await getMappingAndItems(path + '/page')) !== null) {
      return 'dynamic';
    }
    return null;
  },
  // getComponent (id is "**/layout" or "**/page")
  async (id, unstable_setShouldSkip) => {
    unstable_setShouldSkip({}); // always skip if possible
    const result = await getMappingAndItems(id);
    if (result === null) {
      return null;
    }
    const { mapping, items } = result;
    const Route = getRoute(items);
    const Component = (props: Record<string, unknown>) => (
      <Route {...props} {...mapping} />
    );
    return Component;
  },
  // getPathsForBuild
  () => getStaticPaths(),
);
