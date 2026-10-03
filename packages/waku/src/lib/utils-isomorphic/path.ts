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
