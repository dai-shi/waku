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
  return Array.from(idSet);
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

// It starts with "/" to avoid conflicting with normal component ids.
export const SHOULD_SKIP_ID = '/SHOULD_SKIP';

// It starts with "/" to avoid conflicting with normal component ids.
export const ROUTE_ID = '/ROUTE';

// It starts with "/" to avoid conflicting with normal component ids.
export const HAS404_ID = '/HAS404';

// TODO revisit shouldSkip API
export type ShouldSkip = (readonly [
  componentId: string,
  readonly [
    path?: boolean, // if we compare path
    query?: boolean, // if we compare query
  ],
])[];
