// This file should not include Node specific code.

export const encodeInput = (input: string) => {
  if (input === '') {
    return '_';
  } else if (!input.startsWith('_')) {
    return input;
  }
  throw new Error("Input must not start with '_'");
};

export const decodeInput = (encodedInput: string) => {
  if (encodedInput === '_') {
    return '';
  } else if (!encodedInput.startsWith('_')) {
    return encodedInput;
  }
  throw new Error('Invalid encoded input');
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
  .map((input) => `  '${input}': fetch('${basePrefix}${encodeInput(input)}')`)
  .join(',\n')}
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

export const endStream = (stream: WritableStream, message?: string) => {
  const writer = stream.getWriter();
  if (message) {
    new TextEncoder().encode(message).forEach((chunk) => {
      writer.ready.then(() => writer.write(chunk));
    });
  }
  writer.ready.then(() => writer.close());
};

export const concatUint8Arrays = (arrs: Uint8Array[]): Uint8Array => {
  const len = arrs.reduce((acc, arr) => acc + arr.length, 0);
  const array = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrs) {
    array.set(arr, offset);
    offset += arr.length;
  }
  return array;
};
