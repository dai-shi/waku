import fsPromises from 'node:fs/promises';
export const fileExists = async (path: string) =>
  !!(await fsPromises.stat(path).catch(() => false));
