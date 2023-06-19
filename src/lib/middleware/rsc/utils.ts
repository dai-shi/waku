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
  elements: Iterable<readonly [rscId: string, props: unknown]>,
  moduleIds: Iterable<string>
) => {
  const elementsArray = Array.from(elements);
  let code = "";
  if (elementsArray.length) {
    const rscIds = Array.from(new Set(elementsArray.map(([rscId]) => rscId)));
    code += `
globalThis.__WAKU_PREFETCHED__ = {
${rscIds
  .map((rscId) => {
    const value =
      "{" +
      elementsArray
        .flatMap(([id, props]) => {
          if (id !== rscId) return [];
          // FIXME we blindly expect JSON.stringify usage is deterministic
          const serializedProps = JSON.stringify(props);
          const searchParams = new URLSearchParams();
          searchParams.set("props", serializedProps);
          return [
            `'${serializedProps}': fetch('${basePrefix}${rscId}/${searchParams}')`,
          ];
        })
        .join(",") +
      "}";
    return `  '${rscId}': ${value}`;
  })
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
          new RegExp(`^([0-9]+):{"id":"${prefixToRemove}(.*?)"(.*)$`)
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${match[2]}"${match[3]}`;
          changed = true;
        }
      }
      callback(null, changed ? Buffer.from(lines.join("\n")) : chunk);
    },
  });
