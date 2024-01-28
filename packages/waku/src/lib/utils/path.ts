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
    throw new Error('Unsupported absolute file path');
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
  let i = 0;
  while (i < items.length) {
    if (items[i] === '.' || items[i] === '') {
      items.splice(i, 1);
    } else if (items[i] === '..') {
      if (i > 0) {
        items.splice(i - 1, 2);
        --i;
      } else {
        items.splice(i, 1);
      }
    } else {
      ++i;
    }
  }
  return (isAbsolute ? '/' : '') + items.join('/') || '.';
};

export const extname = (filePath: string) => {
  const index = filePath.lastIndexOf('.');
  return index > 0 ? filePath.slice(index) : '';
};

export type PathSpecItem =
  | { type: 'literal'; name: string }
  | { type: 'group'; name?: string }
  | { type: 'wildcard'; name?: string };
export type PathSpec = PathSpecItem[];

export const parsePathWithSlug = (path: string): PathSpec =>
  path
    .split('/')
    .filter(Boolean)
    .map((name) => {
      let type: 'literal' | 'group' | 'wildcard' = 'literal';
      const isSlug = name.startsWith('[') && name.endsWith(']');
      if (isSlug) {
        type = 'group';
        name = name.slice(1, -1);
      }
      const isWildcard = name.startsWith('...');
      if (isWildcard) {
        type = 'wildcard';
        name = name.slice(3);
      }
      return { type, name };
    });
