// This file should not include Node specific code.

export const encodeRscPath = (rscPath: string) => {
  if (rscPath.startsWith('_')) {
    throw new Error('rscPath must not start with `_`: ' + rscPath);
  }
  if (rscPath.endsWith('_')) {
    throw new Error('rscPath must not end with `_`: ' + rscPath);
  }
  if (rscPath === '') {
    rscPath = '_';
  }
  if (rscPath.startsWith('/')) {
    rscPath = '_' + rscPath;
  }
  if (rscPath.endsWith('/')) {
    rscPath += '_';
  }
  return rscPath + '.txt';
};

export const decodeRscPath = (rscPath: string) => {
  if (!rscPath.endsWith('.txt')) {
    const err = new Error('Invalid encoded rscPath');
    (err as any).statusCode = 400;
    throw err;
  }
  rscPath = rscPath.slice(0, -'.txt'.length);
  if (rscPath.startsWith('_')) {
    rscPath = rscPath.slice(1);
  }
  if (rscPath.endsWith('_')) {
    rscPath = rscPath.slice(0, -1);
  }
  return rscPath;
};

const FUNC_PREFIX = 'F/';

export const encodeFuncId = (funcId: string) => {
  const [file, name] = funcId.split('#') as [string, string];
  if (name.includes('/')) {
    throw new Error('Function name must not include `/`: ' + name);
  }
  if (file.startsWith('_')) {
    throw new Error('File must not start with `_`: ' + file);
  }
  if (file.startsWith('/')) {
    return FUNC_PREFIX + '_' + file + '/' + name;
  }
  return FUNC_PREFIX + file + '/' + name;
};

export const decodeFuncId = (encoded: string) => {
  if (!encoded.startsWith(FUNC_PREFIX)) {
    return null;
  }
  const index = encoded.lastIndexOf('/');
  const file = encoded.slice(FUNC_PREFIX.length, index);
  const name = encoded.slice(index + 1);
  if (file.startsWith('_')) {
    return file.slice(1) + '#' + name;
  }
  return file + '#' + name;
};

export const generatePrefetchCode = (
  basePrefix: string,
  rscPaths: Iterable<string>,
  moduleIds: Iterable<string>,
) => {
  const rscPathArray = Array.from(rscPaths);
  let code = '';
  if (rscPathArray.length) {
    code += `
globalThis.__WAKU_PREFETCHED__ = {
${rscPathArray
  .map((rscPath) => {
    const url = basePrefix + encodeRscPath(rscPath);
    return `  '${url}': fetch('${url}'),`;
  })
  .join('\n')}
};`;
  }
  for (const moduleId of moduleIds) {
    code += `
import('${moduleId}');`;
  }
  return code;
};

export const deepFreeze = (x: unknown): void => {
  if (typeof x === 'object' && x !== null) {
    Object.freeze(x);
    for (const value of Object.values(x)) {
      deepFreeze(value);
    }
  }
};
