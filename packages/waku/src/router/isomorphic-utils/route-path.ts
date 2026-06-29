export type RouteProps<Path extends string = string> = {
  path: Path;
  query: string;
  hash: string;
};

export function pathnameToRoutePath(pathname: string): string {
  if (!pathname.startsWith('/')) {
    throw new Error('Pathname must start with `/`: ' + pathname);
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.endsWith('/index.html')) {
    pathname = pathname.slice(0, -'/index.html'.length) || '/';
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname || '/';
}

export function getComponentIds(routePath: string): readonly string[] {
  const pathItems = routePath.split('/').filter(Boolean);
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [...pathItems.slice(0, index), 'layout'].join('/');
    idSet.add(id);
  }
  idSet.add([...pathItems, 'page'].join('/'));
  return ['root', ...Array.from(idSet)];
}

const ROUTE_PREFIX = 'R';
const SLICE_PREFIX = 'S/';

export function encodeRoutePath(routePath: string): string {
  if (!routePath.startsWith('/')) {
    throw new Error('Route path must start with `/`: ' + routePath);
  }
  if (routePath.length > 1 && routePath.endsWith('/')) {
    throw new Error('Route path must not end with `/`: ' + routePath);
  }
  if (routePath.endsWith('/index.html')) {
    throw new Error('Route path must not end with `/index.html`: ' + routePath);
  }
  if (routePath === '/') {
    return ROUTE_PREFIX + '/_root';
  }
  if (routePath.startsWith('/_')) {
    return ROUTE_PREFIX + '/__' + routePath.slice(2);
  }
  return ROUTE_PREFIX + routePath;
}

export function decodeRoutePath(rscPath: string): string {
  if (!rscPath.startsWith(ROUTE_PREFIX)) {
    throw new Error('rscPath should start with: ' + ROUTE_PREFIX);
  }
  if (rscPath === ROUTE_PREFIX + '/_root') {
    return '/';
  }
  if (rscPath.startsWith(ROUTE_PREFIX + '/__')) {
    return '/_' + rscPath.slice(ROUTE_PREFIX.length + 3);
  }
  return rscPath.slice(ROUTE_PREFIX.length);
}

// LIMITATION: This is very limited because it does not support fetching multiple slices in one request. We should generally prefer sending slices with the route if possible.
export function encodeSliceId(sliceId: string): string {
  if (sliceId.startsWith('/')) {
    throw new Error('Slice id must not start with `/`: ' + sliceId);
  }
  return SLICE_PREFIX + sliceId;
}

export function decodeSliceId(rscPath: string): string | null {
  if (!rscPath.startsWith(SLICE_PREFIX)) {
    return null;
  }
  return rscPath.slice(SLICE_PREFIX.length);
}

export const ROUTE_ID = 'ROUTE';
export const IS_STATIC_ID = 'IS_STATIC';
export const HAS404_ID = 'HAS404';
