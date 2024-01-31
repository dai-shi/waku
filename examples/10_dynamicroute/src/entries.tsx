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

const getPathConfig = async () => {
  const files = await glob('**/page.{tsx,js}', { cwd: routesDir });
  return files.map((file) => {
    const names = file.split('/').filter(Boolean).slice(0, -1);
    const pathSpec = names.map((name) => {
      const match = name.match(/^(\[\w+\]|_\w+_)$/);
      if (match) {
        return { type: 'group', name: match[1]!.slice(1, -1) } as const;
      }
      return { type: 'literal', name } as const;
    });
    return {
      path: pathSpec,
      isStatic: pathSpec.every(({ type }) => type === 'literal'),
    };
  });
};

export default defineRouter(
  // getPathConfig
  () => getPathConfig(),
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
);
