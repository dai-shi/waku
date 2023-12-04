// Terminilogy:
// - filePath: posix file path, e.g. `/foo/bar.js` or /c:/foo/bar.js`
// - fileURL: file URL, e.g. `file:///foo/bar.js` or `file:///c:/foo/bar.js`
// - winPath: windows file path, e.g. `c:\foo\bar.js`

// Refs: https://github.com/rollup/plugins/blob/d49bbe8dc5ec41157de5787c72c858f73be107ff/packages/pluginutils/src/normalizePath.ts
// path is either filePath or winPath
export const normalizePath = (path: string) => path.split('\\').join('/');

export const filePathToWinPath = (filePath: string) =>
  filePath.replace(/^\//, '').replace(/\//g, '\\');

export const filePathToFileURL = (filePath: string) => 'file://' + filePath;

export const fileURLToFilePath = (fileURL: string) => {
  if (!fileURL.startsWith('file://')) {
    throw new Error('Not a file URL');
  }
  return fileURL.slice('file://'.length);
};

// for filePath
export const joinPath = (filePaths: string[]) => {
  if (filePaths.length === 0 || !filePaths[0]!.startsWith('/')) {
    throw new Error('First path must be absolute');
  }
  const items = ([] as string[]).concat(
    ...filePaths.map((filePath) => filePath.split('/')),
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
  return '/' + items.join('/');
};
