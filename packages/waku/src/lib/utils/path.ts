// Terminology:
// - filePath: posix-like file path, e.g. `/foo/bar.js` or `c:/foo/bar.js`
//   This is used by Vite.
// - fileURL: file URL, e.g. `file:///foo/bar.js` or `file:///c:/foo/bar.js`
//   This is used by import().
// - osPath: os dependent path, e.g. `/foo/bar.js` or `c:\foo\bar.js`
//   This is used by node:fs.

const ABSOLUTE_WIN32_PATH_REGEXP = /^\/[a-zA-Z]:\//;

export const encodeFilePathToAbsolute = (filePath: string) => {
  if (ABSOLUTE_WIN32_PATH_REGEXP.test(filePath)) {
    throw new Error('Unsupported absolute file path: ' + filePath);
  }
  if (filePath.startsWith('/')) {
    return filePath;
  }
  return '/' + filePath;
};

export const decodeFilePathFromAbsolute = (filePath: string) => {
  if (ABSOLUTE_WIN32_PATH_REGEXP.test(filePath)) {
    return filePath.slice(1);
  }
  return filePath;
};

export const filePathToFileURL = (filePath: string) =>
  'file://' + encodeURI(filePath);

export const fileURLToFilePath = (fileURL: string) => {
  if (!fileURL.startsWith('file://')) {
    throw new Error('Not a file URL');
  }
  return decodeURI(fileURL.slice('file://'.length));
};

// for filePath
export const joinPath = (...paths: string[]) => {
  const isAbsolute = paths[0]?.startsWith('/');
  const items = ([] as string[]).concat(
    ...paths.map((path) => path.split('/')),
  );
  const stack: string[] = [];
  for (const item of items) {
    if (item === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push('..');
      }
    } else if (item && item !== '.') {
      stack.push(item);
    }
  }
  return (isAbsolute ? '/' : '') + stack.join('/') || '.';
};

export const extname = (filePath: string) => {
  const index = filePath.lastIndexOf('.');
  if (index <= 0) {
    return '';
  }
  if (['/', '.'].includes(filePath[index - 1]!)) {
    return '';
  }
  return filePath.slice(index);
};

export type PathSpecItem =
  | { type: 'literal'; name: string }
  | { type: 'group'; name?: string; prefix?: string; suffix?: string }
  | { type: 'wildcard'; name?: string };
export type PathSpec = readonly PathSpecItem[];

const SLUG_PATTERN = /^(.*?)\[([^\]]+)\](.*)$/;

export const parsePathWithSlug = (path: string): PathSpec =>
  path
    .split('/')
    .filter(Boolean)
    .map((name) => {
      const match = SLUG_PATTERN.exec(name);
      if (!match) {
        return { type: 'literal' as const, name };
      }
      const [, prefix, inner, suffix] = match;
      if (inner!.startsWith('...')) {
        return {
          type: 'wildcard' as const,
          name: inner!.slice(3),
        };
      }
      return {
        type: 'group' as const,
        name: inner!,
        ...(prefix ? { prefix } : {}),
        ...(suffix ? { suffix } : {}),
      };
    });

export const parseExactPath = (path: string): PathSpec =>
  path
    .split('/')
    .filter(Boolean)
    .map((name) => ({ type: 'literal', name }));

const escapeRegExp = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/**
 * Transform a path spec to a regular expression.
 */
export const path2regexp = (path: PathSpec) => {
  const parts = path.map((item) => {
    if (item.type === 'literal') {
      return escapeRegExp(item.name);
    } else if (item.type === 'group') {
      const prefix = escapeRegExp(item.prefix ?? '');
      const suffix = escapeRegExp(item.suffix ?? '');
      return `${prefix}([^/]+)${suffix}`;
    } else {
      return `(.*)`;
    }
  });
  return `^/${parts.join('/')}$`;
};

/** Convert a path spec to a string for the path */
export const pathSpecAsString = (path: PathSpec) => {
  return (
    '/' +
    path
      .map((item) => {
        if (item.type === 'literal') {
          return item.name;
        } else if (item.type === 'group') {
          const prefix = item.prefix ?? '';
          const suffix = item.suffix ?? '';
          return `${prefix}[${item.name}]${suffix}`;
        } else {
          return `[...${item.name}]`;
        }
      })
      .join('/')
  );
};

const matchSpecSegment = (
  spec: Exclude<PathSpecItem, { type: 'wildcard' }>,
  segment: string | undefined,
  mapping: Record<string, string | string[]>,
): boolean => {
  if (spec.type === 'literal') {
    return spec.name === segment;
  }
  if (segment === undefined) {
    return false;
  }
  const prefix = spec.prefix ?? '';
  const suffix = spec.suffix ?? '';
  if (prefix || suffix) {
    if (!segment.startsWith(prefix) || !segment.endsWith(suffix)) {
      return false;
    }
    const value = segment.slice(
      prefix.length,
      suffix ? -suffix.length : undefined,
    );
    if (!value) {
      return false;
    }
    if (spec.name) {
      mapping[spec.name] = value;
    }
  } else if (spec.name) {
    mapping[spec.name] = segment;
  }
  return true;
};

/**
 * Helper function to get the path mapping from the path spec and the pathname.
 *
 * @param pathSpec
 * @param pathname - route as a string
 * @example
 * getPathMapping(
 *   [
 *     { type: 'literal', name: 'foo' },
 *     { type: 'group', name: 'a' },
 *   ],
 *   '/foo/bar',
 * );
 * // => { a: 'bar' }
 */
export const getPathMapping = (
  pathSpec: PathSpec,
  pathname: string,
): Record<string, string | string[]> | null => {
  const actual = pathname.split('/').filter(Boolean);
  if (pathSpec.length > actual.length) {
    const wildcardIndex = pathSpec.findIndex(
      (spec) => spec.type === 'wildcard',
    );
    if (wildcardIndex === -1) {
      return null;
    }
    const isTerminalWildcard = wildcardIndex === pathSpec.length - 1;
    if (isTerminalWildcard) {
      // Terminal wildcards only pass through with zero actual segments
      // (handled by the root-wildcard special case below)
      if (actual.length > 0) {
        return null;
      }
    } else if (actual.length < pathSpec.length - 1) {
      // Non-terminal wildcards can match zero segments; just need enough
      // actual segments for every non-wildcard spec in the pathSpec
      return null;
    }
  }
  const mapping: Record<string, string | string[]> = {};
  let wildcardStartIndex = -1;
  for (let i = 0; i < pathSpec.length; i++) {
    const spec = pathSpec[i]!;
    if (spec.type === 'wildcard') {
      wildcardStartIndex = i;
      break;
    }
    if (!matchSpecSegment(spec, actual[i], mapping)) {
      return null;
    }
  }
  if (wildcardStartIndex === -1) {
    if (pathSpec.length !== actual.length) {
      return null;
    }
    return mapping;
  }

  if (wildcardStartIndex === 0 && actual.length === 0) {
    const wildcardName = pathSpec[wildcardStartIndex]!.name;
    if (wildcardName) {
      mapping[wildcardName] = [];
    }
    return mapping;
  }

  let wildcardEndIndex = -1;
  for (let i = 0; i < pathSpec.length; i++) {
    const spec = pathSpec[pathSpec.length - i - 1]!;
    if (spec.type === 'wildcard') {
      wildcardEndIndex = actual.length - i - 1;
      break;
    }
    if (!matchSpecSegment(spec, actual[actual.length - i - 1], mapping)) {
      return null;
    }
  }
  const wildcardName = pathSpec[wildcardStartIndex]!.name;
  if (wildcardName) {
    mapping[wildcardName] = actual.slice(
      wildcardStartIndex,
      wildcardEndIndex + 1,
    );
  }
  return mapping;
};

// basePath config is ensured to have trailing slash (see plugin)
export function removeBase(url: string, base: string) {
  if (base !== '/') {
    if (!url.startsWith(base)) {
      throw new Error('pathname must start with basePath: ' + url);
    }
    return url.slice(base.length - 1);
  }
  return url;
}

export function addBase(url: string, base: string) {
  if (base !== '/' && url.startsWith('/')) {
    return base.slice(0, -1) + url;
  }
  return url;
}

export function countSlugsAndWildcards(pathSpec: PathSpec) {
  let numSlugs = 0;
  let numWildcards = 0;
  for (const slug of pathSpec) {
    if (slug.type !== 'literal') {
      numSlugs++;
    }
    if (slug.type === 'wildcard') {
      numWildcards++;
    }
  }
  return { numSlugs, numWildcards };
}
