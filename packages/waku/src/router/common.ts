export type RouteProps<Path extends string = string> = {
  path: Path;
  query: string;
  hash: string;
};

export function getComponentIds(path: string): readonly string[] {
  const pathItems = path.split('/').filter(Boolean);
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [...pathItems.slice(0, index), 'layout'].join('/');
    idSet.add(id);
  }
  idSet.add([...pathItems, 'page'].join('/'));
  return ['root', ...Array.from(idSet)];
}

const ROUTE_PREFIX = 'R';

export function encodeRoutePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Path must start with `/`: ' + path);
  }
  if (path === '/') {
    return ROUTE_PREFIX + '/_root';
  }
  if (path.endsWith('/')) {
    throw new Error('Path must not end with `/`: ' + path);
  }
  return ROUTE_PREFIX + path;
}

export function decodeRoutePath(rscPath: string): string {
  if (!rscPath.startsWith(ROUTE_PREFIX)) {
    throw new Error('rscPath should not start with `/`');
  }
  if (rscPath === ROUTE_PREFIX + '/_root') {
    return '/';
  }
  return rscPath.slice(ROUTE_PREFIX.length);
}

export const ROUTE_ID = 'ROUTE';
export const IS_STATIC_ID = 'IS_STATIC';
export const HAS404_ID = 'HAS404';

// For HTTP header
export const SKIP_HEADER = 'X-Waku-Router-Skip';
