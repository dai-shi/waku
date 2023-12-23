// This file should not include Node specific code.

// TODO This might be too naive.
// Should we use pathname and searchParams instead of input string?

export const encodeInput = (input: string) => {
  if (input === '') {
    return 'index.txt';
  }
  const [first, second] = input.split('?', 2);
  return first + '.txt' + (second ? '?' + second : '');
};

export const decodeInput = (encodedInput: string) => {
  if (encodedInput === 'index.txt') {
    return '';
  }
  const [first, second] = encodedInput.split('?', 2);
  if (first?.endsWith('.txt')) {
    return first.slice(0, -'.txt'.length) + (second ? '?' + second : '');
  }
  const err = new Error('Invalid encoded input');
  (err as any).statusCode = 400;
  throw err;
};

export const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === 'number';

export const codeToInject = `
globalThis.__waku_module_cache__ = new Map();
globalThis.__webpack_chunk_load__ = (id) => import(id).then((m) => globalThis.__waku_module_cache__.set(id, m));
globalThis.__webpack_require__ = (id) => globalThis.__waku_module_cache__.get(id);`;

export const generatePrefetchCode = (
  basePrefix: string,
  inputs: Iterable<string>,
  moduleIds: Iterable<string>,
) => {
  const inputsArray = Array.from(inputs);
  let code = '';
  if (inputsArray.length) {
    code += `
globalThis.__WAKU_PREFETCHED__ = {
${inputsArray
  .map((input) => `  '${input}': fetch('${basePrefix}${encodeInput(input)}'),`)
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
