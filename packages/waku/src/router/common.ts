export type RouteProps = {
  path: string;
  searchParams: URLSearchParams;
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

// XXX This custom encoding might not work in some edge cases.

export function getInputString(
  path: string,
  searchParams: URLSearchParams,
  skip?: string[],
): string {
  const search = searchParams.toString() || '';
  if (search.includes('/')) {
    throw new Error('Invalid search params');
  }
  let input = search
    ? '=' + path.replace(/\/$/, '/__INDEX__') + '/' + search
    : '-' + path.replace(/\/$/, '/__INDEX__');
  if (skip) {
    const params = new URLSearchParams();
    skip.forEach((id) => params.append('skip', id));
    input += '?' + params;
  }
  return input;
}

export function parseInputString(input: string): {
  path: string;
  searchParams: URLSearchParams;
  skip?: string[];
} {
  const [first, second] = input.split('?', 2);
  const skip = second && new URLSearchParams(second).getAll('skip');
  if (first?.startsWith('=')) {
    const index = first.lastIndexOf('/');
    return {
      path: first.slice(1, index).replace(/\/__INDEX__$/, '/'),
      searchParams: new URLSearchParams(first.slice(index + 1)),
      ...(skip ? { skip } : {}),
    };
  } else if (first?.startsWith('-')) {
    return {
      path: first.slice(1).replace(/\/__INDEX__$/, '/'),
      searchParams: new URLSearchParams(),
      ...(skip ? { skip } : {}),
    };
  } else {
    const err = new Error('Invalid input string');
    (err as any).statusCode = 400;
    throw err;
  }
}
