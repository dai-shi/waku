export type RouteProps = {
  path: string;
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

export function getInputString(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Path should start with `/`');
  }
  return path.slice(1);
}

export function parseInputString(input: string): string {
  if (input.startsWith('/')) {
    throw new Error('Input should not start with `/`');
  }
  return '/' + input;
}

// It starts with "/" to avoid conflicting with normal component ids.
export const SHOULD_SKIP_ID = '/SHOULD_SKIP';

// It starts with "/" to avoid conflicting with normal component ids.
export const LOCATION_ID = '/LOCATION';

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
