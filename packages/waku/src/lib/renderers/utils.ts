// This file should not include Node specific code.

export const encodeRscPath = (rscPath: string) => {
  if (rscPath === '') {
    return 'index.txt';
  }
  if (rscPath === 'index') {
    throw new Error('rscPath should not be `index`');
  }
  if (rscPath.startsWith('/')) {
    throw new Error('rscPath should not start with `/`');
  }
  if (rscPath.endsWith('/')) {
    throw new Error('rscPath should not end with `/`');
  }
  return rscPath + '.txt';
};

export const decodeRscPath = (encodedRscPath: string) => {
  if (encodedRscPath === 'index.txt') {
    return '';
  }
  if (encodedRscPath?.endsWith('.txt')) {
    return encodedRscPath.slice(0, -'.txt'.length);
  }
  const err = new Error('Invalid encoded rscPath');
  (err as any).statusCode = 400;
  throw err;
};

const FUNC_PREFIX = 'FUNC_';

export const encodeFuncId = (funcId: string) => {
  const [file, name] = funcId.split('#') as [string, string];
  if (name.includes('/')) {
    throw new Error('Unsupported function name');
  }
  return FUNC_PREFIX + file + '/' + name;
};

export const decodeFuncId = (encoded: string) => {
  if (!encoded.startsWith(FUNC_PREFIX)) {
    return null;
  }
  const index = encoded.lastIndexOf('/');
  return (
    encoded.slice(FUNC_PREFIX.length, index) + '#' + encoded.slice(index + 1)
  );
};

export const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === 'number';

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
