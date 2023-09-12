import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

export const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === "number";

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
  let code = "";
  if (inputsArray.length) {
    code += `
globalThis.__WAKU_PREFETCHED__ = {
${inputsArray
  .map(
    (input) => `  '${input}': fetch('${basePrefix}${input || "__DEFAULT__"}')`,
  )
  .join(",\n")}
};`;
  }
  for (const moduleId of moduleIds) {
    code += `
import('${moduleId}');`;
  }
  return code;
};

// HACK Patching stream is very fragile.
export const transformRsfId = (prefixToRemove: string) =>
  new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      const data = chunk.toString();
      const lines = data.split("\n");
      let changed = false;
      for (let i = 0; i < lines.length; ++i) {
        const match = lines[i].match(
          new RegExp(`^([0-9]+):{"id":"${prefixToRemove}(.*?)"(.*)$`),
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${match[2]}"${match[3]}`;
          changed = true;
        }
      }
      callback(null, changed ? Buffer.from(lines.join("\n")) : chunk);
    },
  });

export const deepFreeze = (x: unknown): void => {
  if (typeof x === "object" && x !== null) {
    Object.freeze(x);
    for (const value of Object.values(x)) {
      deepFreeze(value);
    }
  }
};
