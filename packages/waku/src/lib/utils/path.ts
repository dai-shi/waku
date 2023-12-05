// Terminology:
// - filePath: posix-like file path, e.g. `/foo/bar.js` or `c:/foo/bar.js`
//   This is used by Vite.
// - fileURL: file URL, e.g. `file:///foo/bar.js` or `file:///c:/foo/bar.js`
//   This is used by import().
// - osPath: os dependent path, e.g. `/foo/bar.js` or `c:\foo\bar.js`
//   This is used by node:fs.

// Refs: https://github.com/rollup/plugins/blob/d49bbe8dc5ec41157de5787c72c858f73be107ff/packages/pluginutils/src/normalizePath.ts
// path is either filePath or osPath
export const normalizePath = (path: string) => {
  if (path.startsWith('file://')) {
    throw new Error('Unexpected file URL');
  }
  return path.replace(/\\/g, '/');
};

const WIN32_ROOT = '/__WIN32__/';

export const encodeFilePathToAbsolute = (filePath: string) => {
  if (filePath.startsWith(WIN32_ROOT)) {
    throw new Error('Unsupported absolute file path');
  }
  if (filePath.startsWith('/')) {
    return filePath;
  }
  return WIN32_ROOT + filePath;
};

export const decodeFilePathFromAbsolute = (filePath: string) => {
  if (filePath.startsWith(WIN32_ROOT)) {
    return filePath.slice(WIN32_ROOT.length);
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

// for filePath
export const relativePath = (from: string, to: string) => {
  const fromItems = from.split('/');
  const toItems = to.split('/');
  let i = 0;
  while (
    i < fromItems.length &&
    i < toItems.length &&
    fromItems[i] === toItems[i]
  ) {
    ++i;
  }
  return [
    ...new Array(fromItems.length - i).fill('..'),
    ...toItems.slice(i),
  ].join('/');
};

export const extname = (filePath: string) => {
  const index = filePath.lastIndexOf('.');
  return index > 0 ? filePath.slice(index) : '';
};
